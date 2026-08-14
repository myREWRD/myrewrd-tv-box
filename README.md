# myREWRD TV Box

A dedicated Electron application that runs on venue TV hardware, providing:
- **Regular Mode**: Standard TV board (artist lineup, sponsors, leaderboard)
- **Stream Mode**: Live stream (YouTube/Twitch) + side panel with artist/sponsor rotation
- **Game Day Mode**: Full-screen streaming (NFL/sports) + slim sponsor bar at bottom

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VENUE HARDWARE                           │
│  Mini PC (Intel NUC / Beelink / Raspberry Pi 5)                │
│  Connected to TV via HDMI                                       │
│  Runs: myREWRD TV Box (this Electron app)                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │ WebSocket (real-time)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     myREWRD SERVER                              │
│  app.myrewrd.com/api/tv-ws                                     │
│  Handles: mode switching, sponsor data, stream URLs             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌──────────────────────┐    ┌──────────────────────┐
│   VENUE DASHBOARD    │    │    VENUE APP         │
│   (Web - Desktop)    │    │  (Mobile - Staff)    │
│                      │    │                      │
│  TV Board Settings   │    │  TV Remote Section   │
│  - Mode toggle       │    │  - Mode toggle       │
│  - Stream URL        │    │  - Quick controls    │
│  - Game Day schedule │    │  - Volume            │
│  - Sponsor select    │    │  - Service login     │
└──────────────────────┘    └──────────────────────┘
```

## Modes

### Regular Mode
Loads the standard TV board URL (`/tv/{token}`). Full artist spotlight rotation,
sponsor slides, VIP leaderboard, check-in celebrations.

### Stream Mode  
Loads the TV board in live stream layout (`/tv/{token}` with `live_stream_enabled`).
80% stream + 20% side panel with artist/sponsor/leaderboard cycling.

### Game Day Mode
Full-screen streaming content (94% of screen) with a slim sponsor bar (6%) at the bottom.
- Stream plays in a BrowserView with full DRM support (Widevine)
- Venue logs into YouTube TV / Hulu / ESPN once — session persists
- Sponsor bar shows: [🏈] Live Game Sponsored by [SPONSOR LOGO] [SPONSOR NAME]
- Sponsor data refreshes every 5 minutes from the API

## Setup

### Development
```bash
npm install
npm start
```

### Building
```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux (for mini PCs)
npm run build:linux
```

### Venue Setup
1. Install the app on the mini PC connected to the TV
2. App boots into pairing screen
3. Enter the TV token from the venue dashboard (TV Board → Pair Device)
4. Device connects and loads the TV board
5. Control modes from the dashboard or venue staff app

## WebSocket Commands

The TV Box listens for commands via WebSocket:

| Command | Payload | Description |
|---------|---------|-------------|
| `switch_mode` | `{ mode: 'regular' \| 'stream' \| 'gameday', options: {} }` | Switch display mode |
| `set_stream_url` | `{ url: string }` | Change stream URL in game day mode |
| `open_service` | `{ url: string }` | Open streaming service for login |
| `navigate` | `{ url: string }` | Navigate stream view to URL |
| `refresh` | `{}` | Reload current content |
| `volume` | `{ muted: boolean }` | Mute/unmute stream audio |
| `pair` | `{ tvToken, venueId, venueName }` | Pair device to venue |
| `unpair` | `{}` | Unpair device |
| `ping` | `{}` | Request state update |

## Hardware Recommendations

### Budget Option (~$130)
- **Beelink Mini S12 Pro** (Intel N100, 8GB RAM, 256GB SSD)
- Runs Linux or Windows
- Fanless, silent operation
- HDMI 2.0 output (4K capable)

### Mid-Range Option (~$200)
- **Intel NUC 12 Essential** (Intel N97, 8GB RAM, 256GB SSD)
- More reliable for 24/7 operation
- Dual HDMI output
- Better thermal management

### Premium Option (~$350)
- **Intel NUC 13 Pro** (Intel i3-1315U, 16GB RAM, 512GB SSD)
- Best performance for 4K streaming
- Thunderbolt connectivity
- Enterprise-grade reliability

### All Options Include:
- WiFi 6 built-in
- Bluetooth 5.2
- USB ports for peripherals
- VESA mount (attach behind TV)
- Auto-power-on after power loss (BIOS setting)

### Bulk Pricing (10+ units):
- Budget: ~$110/unit
- Mid-Range: ~$175/unit
- Premium: ~$300/unit

### Recommended Accessories:
- Short HDMI cable (1-2ft): $8
- VESA mount bracket: $12
- USB wireless keyboard/mouse (for initial setup only): $25

## Auto-Boot Configuration

### Linux (Ubuntu/Debian):
```bash
# Create autostart entry
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/myrewrd-tv.desktop << EOF
[Desktop Entry]
Type=Application
Name=myREWRD TV Box
Exec=/opt/myrewrd-tv-box/myrewrd-tv-box --kiosk
X-GNOME-Autostart-enabled=true
EOF
```

### Windows:
- Add to Startup folder or create a Scheduled Task
- Set BIOS to auto-power-on after AC power loss
- Disable Windows Update auto-restart

## Security
- Device authenticates via TV token (same as web TV board)
- WebSocket connection is encrypted (WSS)
- No venue credentials stored locally (streaming service sessions use browser cookies)
- Auto-updater verifies code signatures before installing updates
