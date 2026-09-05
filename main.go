package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3003"
	}

	// Serve static files with cache-control headers
	fs := http.FileServer(http.Dir("./web"))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, must-revalidate")
		fs.ServeHTTP(w, r)
	})

	addr := "127.0.0.1:" + port
	fmt.Printf("Serving miksfamily on %s ...\n", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("❌ HTTP server failed: %v", err)
	}
}
