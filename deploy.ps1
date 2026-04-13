# -------- CONFIG --------
$EC2_USER   = "ec2-user"
$EC2_IP     = "18.191.255.8"
$PEM_PATH   = "C:\webstuff\security\keypair1.pem"
$REMOTE_DIR = "/home/ec2-user/miksfamilysite"
$APP_NAME   = "miksfamily"
# ------------------------

Write-Host "🏗️  Building Go binary..."
$env:GOOS = "linux"
$env:GOARCH = "amd64"
go build -o $APP_NAME main.go
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Build failed."; exit 1 }

Write-Host "🚀 Copying files to EC2..."
$remoteTarget = "$EC2_USER@$EC2_IP" + ":" + "$REMOTE_DIR/"
scp -i $PEM_PATH $APP_NAME $remoteTarget
scp -i $PEM_PATH -r web $remoteTarget

Write-Host "🔄 Restarting app on EC2..."
$cmd = @"
#!/bin/bash -e
echo '📦 Stopping old process...'
sudo pkill -9 -f miksfamily || true
sleep 2
echo '🔐 Granting port binding permission...'
sudo setcap 'cap_net_bind_service=+ep' /home/ec2-user/miksfamilysite/miksfamily
sudo chmod 755 /etc/letsencrypt/live /etc/letsencrypt/archive
sudo chmod 644 /etc/letsencrypt/live/miksfamily.com/fullchain.pem /etc/letsencrypt/live/miksfamily.com/privkey.pem
echo '🚀 Starting new miksfamily server...'
cd /home/ec2-user/miksfamilysite
nohup /home/ec2-user/miksfamilysite/miksfamily > /home/ec2-user/miksfamilysite/app.log 2>&1 &
sleep 4
echo '✅ Server restarted. Showing last 10 lines of app.log...'
sudo tail -n 10 /home/ec2-user/miksfamilysite/app.log || echo 'No log yet.'
"@ -replace "`r",""   # strip Windows carriage returns
ssh -T -i $PEM_PATH "$EC2_USER@$EC2_IP" $cmd

Write-Host "🔍 Checking miksfamily.com health..."
Start-Sleep -Seconds 4
try {
    $response = Invoke-WebRequest -Uri "https://miksfamily.com" -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ miksfamily.com is live! (HTTP $($response.StatusCode))"
    } else {
        Write-Host "⚠️ miksfamily.com responded with HTTP $($response.StatusCode)"
    }
} catch {
    Write-Host "❌ Health check failed: $($_.Exception.Message)"
}

Write-Host "✅ Deployment complete! Visit https://miksfamily.com"
