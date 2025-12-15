package main

import (
    "fmt"
    "log"
    "net/http"
)

func main() {
    // Serve static files
    fs := http.FileServer(http.Dir("./web"))
    http.Handle("/", fs)

    // Redirect all HTTP traffic to HTTPS
    go func() {
        fmt.Println("Redirecting HTTP to HTTPS on :80 ...")
        err := http.ListenAndServe(":80", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            target := "https://" + r.Host + r.URL.Path
            if len(r.URL.RawQuery) > 0 {
                target += "?" + r.URL.RawQuery
            }
            http.Redirect(w, r, target, http.StatusMovedPermanently)
        }))
        if err != nil {
            log.Printf("⚠️ HTTP redirect server error: %v", err)
        }
    }()

    // Serve HTTPS using Let's Encrypt certs
    fmt.Println("Serving HTTPS on :443 ...")
    err := http.ListenAndServeTLS(":443",
        "/etc/letsencrypt/live/miksfamily.com/fullchain.pem",
        "/etc/letsencrypt/live/miksfamily.com/privkey.pem",
        nil)
    if err != nil {
        log.Fatalf("❌ HTTPS server failed: %v", err)
    }
}