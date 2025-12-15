#!/bin/bash
set -e

# -------- CONFIG --------
EC2_USER="ec2-user"
EC2_IP="18.191.255.8"
PEM_PATH="$HOME/.ssh/keypair1.pem"          # must exist on Linux
REMOTE_DIR="/home/ec2-user/miksfamilysite"
APP_NAME="miksfamily"
# ------------------------

echo "🏗️  Building Go binary for Linux..."
GOOS=linux GOARCH=amd64 go build -o "$APP_NAME" main.go

echo "🚀 Copying files to EC2..."
# Upload the binary safely to /tmp first (avoids permission issues)
scp -i "$PEM_PATH" "$APP_NAME" "$EC2_USER@$EC2_IP:/tmp/"
scp -i "$PEM_PATH" -r web "$EC2_USER@$EC2_IP:/tmp/web"

echo "🔄 Restarting app on EC2..."
ssh -i "$PEM_PATH" "$EC2_USER@$EC2_IP" << EOF
set -e
echo "📦 Stopping old process (if any)..."
sudo fuser -k 443/tcp || true
sudo fuser -k 80/tcp || true
sudo pkill -9 -f "$APP_NAME" || true
sleep 2

echo "📂 Moving new files into place..."
sudo mv /tmp/$APP_NAME "$REMOTE_DIR/$APP_NAME"
sudo rm -rf "$REMOTE_DIR/web"
sudo mv /tmp/web "$REMOTE_DIR/"
sudo chown -R ec2-user:ec2-user "$REMOTE_DIR"

echo "🚀 Starting new server..."
cd "$REMOTE_DIR"
sudo nohup "$REMOTE_DIR/$APP_NAME" > "$REMOTE_DIR/app.log" 2>&1 &
sleep 3

echo "✅ Last 10 lines of app.log:"
tail -n 10 "$REMOTE_DIR/app.log" || echo "No log yet."
EOF

echo "🔍 Checking miksfamily.com health..."
sleep 5
if curl -k -s --head https://miksfamily.com | grep -E "200|301|302" > /dev/null; then
    echo "✅ miksfamily.com is live!"
else
    echo "⚠️ miksfamily.com did not respond with 200/301/302"
fi

echo "✅ Deployment complete! Visit https://miksfamily.com"
