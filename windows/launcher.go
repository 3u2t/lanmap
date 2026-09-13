package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

func main() {
	exePath, _ := filepath.Abs(os.Args[0])
	exeDir := filepath.Dir(exePath)
	if os.Getenv("DATA_DIR") == "" && runtime.GOOS == "windows" {
		if la := os.Getenv("LOCALAPPDATA"); la != "" {
			_ = os.Setenv("DATA_DIR", filepath.Join(la, "LANMap", "data"))
		}
	}
	if os.Getenv("PORT") == "" {
		_ = os.Setenv("PORT", "8081")
	}

	nodeBin := "node"
	if runtime.GOOS == "windows" {
		candidate := filepath.Join(exeDir, "node.exe")
		if _, err := os.Stat(candidate); err == nil {
			nodeBin = candidate
		} else {
			nodeBin = "node.exe"
		}
	}

	candidates := []string{
		filepath.Join(exeDir, "backend", "dist", "index.js"),
		filepath.Join(exeDir, "..", "backend", "dist", "index.js"),
		filepath.Join(exeDir, "lanmap", "backend", "dist", "index.js"),
	}
	var backend string
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			backend = c
			break
		}
	}
	if backend == "" {
		fmt.Fprintln(os.Stderr, "lanmap: backend/dist/index.js nicht gefunden. Bitte lanmap-windows.zip komplett entpacken.")
		fmt.Fprintln(os.Stderr, "Erwartet neben lanmap.exe: backend/dist/index.js und frontend/dist/")
		if runtime.GOOS == "windows" {
			fmt.Fprintln(os.Stderr, "\nDrücke Enter zum Beenden...")
			fmt.Scanln()
		}
		os.Exit(1)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	url := "http://localhost:" + port

	fmt.Printf("LANMap — See what's on your network.\n")
	fmt.Printf("Starte Backend: %s %s\n", nodeBin, backend)
	fmt.Printf("Frontend: %s  Port: %s\n", findFrontend(exeDir), port)
	fmt.Printf("Daten: %s\n\n", os.Getenv("DATA_DIR"))

	cmd := exec.Command(nodeBin, backend)
	cmd.Dir = exeDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = os.Environ()
	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Fehler beim Starten von Node: %v\n", err)
		fmt.Fprintln(os.Stderr, "Ist Node.js 22+ installiert? Lade es von https://nodejs.org oder lege node.exe neben lanmap.exe.")
		if runtime.GOOS == "windows" {
			fmt.Scanln()
		}
		os.Exit(1)
	}

	go func() {
		for i := 0; i < 60; i++ {
			time.Sleep(500 * time.Millisecond)
			resp, err := http.Get(url + "/health")
			if err == nil && resp.StatusCode == 200 {
				resp.Body.Close()
				fmt.Printf("\n✓ LANMap läuft: %s\n", url)
				openBrowser(url)
				return
			}
			if resp != nil {
				resp.Body.Close()
			}
		}
		fmt.Printf("\nLANMap läuft (vermutlich) auf %s — öffne es manuell im Browser.\n", url)
	}()

	fmt.Printf("Drücke Ctrl+C zum Beenden.\n\n")
	if err := cmd.Wait(); err != nil {
		fmt.Fprintf(os.Stderr, "\nBackend beendet: %v\n", err)
		if runtime.GOOS == "windows" {
			fmt.Fprintln(os.Stderr, "Drücke Enter...")
			fmt.Scanln()
		}
		os.Exit(1)
	}
}

func findFrontend(exeDir string) string {
	candidates := []string{
		filepath.Join(exeDir, "frontend-dist"),
		filepath.Join(exeDir, "frontend", "dist"),
		filepath.Join(exeDir, "..", "frontend", "dist"),
	}
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(c, "index.html")); err == nil {
			return c
		}
	}
	return "(nicht gefunden — npm run build ausführen)"
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}
