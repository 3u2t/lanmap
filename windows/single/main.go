package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

//go:embed node.exe
var nodeExe []byte

//go:embed all:backend/dist
var backendFS embed.FS

//go:embed all:frontend/dist
var frontendFS embed.FS

//go:embed backend/package.json
var backendPkg []byte

func main() {
	tmpRoot := filepath.Join(os.TempDir(), fmt.Sprintf("lanmap-%d", os.Getpid()))
	backendDir := filepath.Join(tmpRoot, "backend", "dist")
	frontendDir := filepath.Join(tmpRoot, "frontend", "dist")
	if err := os.MkdirAll(backendDir, 0755); err != nil {
		fatal(err)
	}
	if err := os.MkdirAll(frontendDir, 0755); err != nil {
		fatal(err)
	}

	nodePath := filepath.Join(tmpRoot, "node.exe")
	if err := os.WriteFile(nodePath, nodeExe, 0755); err != nil {
		fatal(err)
	}

	if err := writeFS(backendFS, "backend/dist", backendDir); err != nil {
		fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmpRoot, "backend", "package.json"), backendPkg, 0644); err != nil {
		fatal(err)
	}
	if err := writeFS(frontendFS, "frontend/dist", frontendDir); err != nil {
		fatal(err)
	}
	_ = os.WriteFile(filepath.Join(tmpRoot, "README.txt"), []byte("LANMap — See what's on your network.\nDaten: %LOCALAPPDATA%\\LANMap\\data\n"), 0644)

	if os.Getenv("DATA_DIR") == "" {
		if la := os.Getenv("LOCALAPPDATA"); la != "" {
			_ = os.Setenv("DATA_DIR", filepath.Join(la, "LANMap", "data"))
		} else {
			_ = os.Setenv("DATA_DIR", filepath.Join(tmpRoot, "data"))
		}
	}
	if os.Getenv("PORT") == "" {
		_ = os.Setenv("PORT", "8081")
	}
	_ = os.MkdirAll(filepath.Join(tmpRoot, "frontend-dist"), 0755)
	_ = copyDir(frontendDir, filepath.Join(tmpRoot, "frontend-dist"))

	port := os.Getenv("PORT")
	url := "http://localhost:" + port
	backendEntry := filepath.Join(backendDir, "index.js")

	fmt.Printf("LANMap — See what's on your network.\n")
	fmt.Printf("Entpackt nach: %s\n", tmpRoot)
	fmt.Printf("Starte: %s %s\n", nodePath, backendEntry)
	fmt.Printf("Port %s — Daten %s\n\n", port, os.Getenv("DATA_DIR"))

	cmd := exec.Command(nodePath, backendEntry)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = os.Environ()
	cmd.Dir = tmpRoot
	if err := cmd.Start(); err != nil {
		fatal(fmt.Errorf("Node starten fehlgeschlagen: %w", err))
	}

	defer func() {
		_ = os.RemoveAll(tmpRoot)
	}()

	go func() {
		for i := 0; i < 80; i++ {
			time.Sleep(400 * time.Millisecond)
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
		fmt.Printf("\nLANMap läuft (vermutlich) auf %s\n", url)
	}()

	fmt.Println("Drücke Ctrl+C zum Beenden. Nicht das Fenster schließen, solange LANMap laufen soll.")
	if err := cmd.Wait(); err != nil {
		fmt.Fprintf(os.Stderr, "Backend beendet: %v\n", err)
		if runtime.GOOS == "windows" {
			fmt.Fprintln(os.Stderr, "Enter zum Schließen...")
			fmt.Scanln()
		}
		os.Exit(1)
	}
}

func writeFS(efs embed.FS, srcPrefix, dest string) error {
	return fs.WalkDir(efs, srcPrefix, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(srcPrefix, path)
		rel = filepath.FromSlash(rel)
		if rel == "." {
			return nil
		}
		target := filepath.Join(dest, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		data, err := fs.ReadFile(efs, path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0644)
	})
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		if rel == "." {
			return nil
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0644)
	})
}

func openBrowser(url string) {
	var c *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		c = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		c = exec.Command("open", url)
	default:
		c = exec.Command("xdg-open", url)
	}
	_ = c.Start()
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	if runtime.GOOS == "windows" {
		fmt.Fprintln(os.Stderr, "Enter...")
		fmt.Scanln()
	}
	os.Exit(1)
}
