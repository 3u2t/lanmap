package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

type ifaceInfo struct {
	Name string `json:"name"`
	MAC  string `json:"mac,omitempty"`
	IPv4 string `json:"ipv4,omitempty"`
	IPv6 string `json:"ipv6,omitempty"`
	Up   bool   `json:"up"`
}

type report struct {
	Hostname   string      `json:"hostname"`
	At         int64       `json:"at"`
	Interfaces []ifaceInfo `json:"interfaces"`
	Gateway    string      `json:"gateway,omitempty"`
}

func defaultGateway() string {
	data, err := os.ReadFile("/proc/net/route")
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n")[1:] {
		f := strings.Fields(line)
		if len(f) < 3 || f[1] != "00000000" {
			continue
		}
		var n uint32
		if _, err := fmt.Sscanf(f[2], "%08x", &n); err != nil {
			continue
		}
		return fmt.Sprintf("%d.%d.%d.%d", n&255, (n>>8)&255, (n>>16)&255, (n>>24)&255)
	}
	return ""
}

func parseGatewayLine(line string) string {
	f := strings.Fields(line)
	if len(f) < 3 || f[1] != "00000000" {
		return ""
	}
	var n uint32
	if _, err := fmt.Sscanf(f[2], "%08x", &n); err != nil {
		return ""
	}
	return fmt.Sprintf("%d.%d.%d.%d", n&255, (n>>8)&255, (n>>16)&255, (n>>24)&255)
}

func collect() report {
	host, _ := os.Hostname()
	ifs, _ := net.Interfaces()
	out := report{Hostname: host, At: time.Now().UnixMilli(), Gateway: defaultGateway()}
	for _, i := range ifs {
		ii := ifaceInfo{Name: i.Name, Up: i.Flags&net.FlagUp != 0}
		if mac := i.HardwareAddr.String(); mac != "" {
			ii.MAC = strings.ToUpper(mac)
		}
		addrs, _ := i.Addrs()
		for _, a := range addrs {
			ip, _, _ := net.ParseCIDR(a.String())
			if ip == nil {
				continue
			}
			if ip.To4() != nil {
				if ii.IPv4 == "" {
					ii.IPv4 = ip.String()
				}
			} else if ii.IPv6 == "" && !ip.IsLinkLocalUnicast() {
				ii.IPv6 = ip.String()
			}
		}
		out.Interfaces = append(out.Interfaces, ii)
	}
	return out
}

func send(server, secret string, r report) error {
	body, _ := json.Marshal(r)
	req, _ := http.NewRequest("POST", strings.TrimRight(server, "/")+"/api/agent/report", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if secret != "" {
		req.Header.Set("X-Agent-Secret", secret)
	}
	c := &http.Client{Timeout: 10 * time.Second}
	resp, err := c.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("server returned %s", resp.Status)
	}
	return nil
}

func main() {
	server := flag.String("server", "http://localhost:8081", "LANMap server URL")
	interval := flag.Duration("interval", 30*time.Second, "report interval")
	flag.Parse()
	secret := os.Getenv("AGENT_SECRET")
	log.Printf("lanmap-agent: reporting to %s every %s", *server, *interval)
	backoff := time.Second
	for {
		if err := send(*server, secret, collect()); err != nil {
			log.Printf("report failed: %v (retry in %s)", err, backoff)
			time.Sleep(backoff)
			backoff = min(backoff*2, 5*time.Minute)
			continue
		}
		backoff = time.Second
		time.Sleep(*interval)
	}
}
