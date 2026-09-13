package main

import "testing"

func TestParseGatewayLine(t *testing.T) {
	cases := []struct {
		line string
		want string
	}{
		{"eth0\t00000000\t0101A8C0\t00000000\t0\t0\t0\t00000000\t0\t0\t0", "192.168.1.1"},
		{"eth0\t001AA8C0\t00000000\t00000000\t0\t0\t0\t000000FF\t0\t0\t0", ""},
		{"garbage", ""},
	}
	for _, c := range cases {
		if got := parseGatewayLine(c.line); got != c.want {
			t.Errorf("parseGatewayLine(%q) = %q, want %q", c.line, got, c.want)
		}
	}
}
