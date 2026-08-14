# myREWRD TV Box — Complete Business & Setup Guide

## Executive Summary

The myREWRD TV Box is a pre-configured mini PC that venues plug into their TV via HDMI. It runs the myREWRD TV Board software and enables Game Day Mode with sponsor overlays on live NFL streams. The venue controls everything from their existing dashboard — no technical knowledge required.

**Revenue model:** Hardware sale ($299-399 one-time) + optional monthly service fee ($49/mo for Game Day features). Sponsors pay premium rates for Game Day placement (their brand on screen for 2-3 hours during NFL games).

---

## Hardware Recommendations

### Recommended Device: Beelink Mini S12 Pro

| Spec | Details |
|------|---------|
| **Processor** | Intel N100 (4 cores, up to 3.4GHz) |
| **RAM** | 8GB DDR4 |
| **Storage** | 256GB M.2 SSD |
| **GPU** | Intel UHD Graphics (4K@60Hz) |
| **Ports** | 2x HDMI, 2x USB 3.2, 2x USB 2.0, Gigabit Ethernet |
| **WiFi** | WiFi 6 + Bluetooth 5.2 |
| **Size** | 4.5" x 4.5" x 1.5" (fits behind TV) |
| **VESA Mount** | Yes (included bracket) |
| **Power** | 12V DC, ~15W idle |
| **Auto Power On** | Yes (BIOS setting: "Restore on AC Power Loss") |
| **Fanless** | No (very quiet fan), but adequate for 24/7 use |
| **OS** | Windows 11 Pro (pre-installed) |

### Pricing Tiers

| Quantity | Unit Cost (Alibaba/Direct) | Unit Cost (Amazon) | Your Sell Price |
|----------|---------------------------|--------------------|-----------------| 
| 1-9 units | $155-175 | $169-189 | $349 |
| 10-24 units | $135-150 | N/A (bulk from Alibaba) | $299 |
| 25-49 units | $120-135 | N/A | $299 |
| 50+ units | $100-120 | N/A | $249 |

### Alternative Options

| Device | Price | Pros | Cons |
|--------|-------|------|------|
| **Beelink Mini S12 Pro** (Recommended) | $155-175 | Best value, reliable, 4K dual HDMI, VESA mount | Has a fan (quiet) |
| **MeLE Quieter 4C** | $230-330 | Completely fanless, ultra-compact | More expensive, less RAM options |
| **Minisforum UN100D** | $160-180 | Good build quality, wholesale program | Similar to Beelink |
| **ACEPC T11 Plus** | $140-160 | Cheapest option, fanless | Less reliable long-term |
| **Azulle Inspire** | $200-250 | Purpose-built for signage, 24/7 rated | Limited availability |

### Additional Hardware Per Unit

| Item | Cost | Purpose |
|------|------|---------|
| HDMI cable (6ft, 4K) | $8 | Connect to TV |
| VESA mount bracket | Included | Mount behind TV |
| USB keyboard (setup only) | $12 (reusable) | Initial WiFi/pairing setup |
| Shipping box + branding | $5-8 | Professional packaging |
| **Total cost per unit** | **~$175-195** | |
| **Sell price per unit** | **$299-349** | |
| **Margin per unit** | **$104-174 (35-50%)** | |

---

## Where to Buy (Bulk)

### For 10-50 units:
1. **Alibaba** — Search "Beelink Mini S12 Pro" or "Intel N100 mini PC OEM"
   - Supplier: Shenzhen Beelink Technology (official)
   - MOQ: Usually 10 units
   - Lead time: 7-14 days (air), 25-35 days (sea)
   - Payment: Trade Assurance (buyer protection)

2. **Minisforum Wholesale Program** — https://store.minisforum.com/pages/wholesale
   - Fill out B2B form for volume pricing
   - Ships from US warehouse

3. **Amazon Business** — For smaller quantities (1-10)
   - Beelink Mini S12 Pro: ~$169 each
   - Prime shipping, easy returns
   - Good for initial testing batch

### For 50+ units:
- Contact Beelink directly via Alibaba for OEM pricing
- Can get custom branding (myREWRD logo on the device)
- Can get custom OS image pre-loaded (your Electron app pre-installed)

---

## Software Pre-Configuration

### What gets installed on each device before shipping to venue:

1. **Windows 11 Pro** (comes pre-installed)
2. **myREWRD TV Box app** (Electron) — auto-starts on boot
3. **Chrome browser** — for YouTube TV/Hulu login (Game Day mode)
4. **Auto-updater** — pushes new versions remotely
5. **BIOS settings:**
   - "Restore on AC Power Loss" = ON (auto-boots when power returns)
   - "Wake on LAN" = ON (remote wake capability)

### Setup Script (run once per device):
```powershell
# 1. Install Electron app
# 2. Set auto-start on boot (Task Scheduler)
# 3. Disable Windows Update restart prompts
# 4. Set power plan to "High Performance"
# 5. Disable screen saver and sleep
# 6. Set HDMI output to 4K@60Hz
# 7. Configure auto-login (no password prompt)
```

---

## Venue Setup Process (What the venue does)

### Step 1: Unbox & Connect (2 minutes)
1. Plug HDMI cable from TV Box into TV
2. Plug power adapter into outlet
3. Device auto-boots and shows pairing screen

### Step 2: Connect to WiFi (1 minute)
1. Use the included mini keyboard to select WiFi network
2. Enter WiFi password
3. Device connects and shows "Ready to Pair" with a 6-digit code

### Step 3: Pair with Dashboard (30 seconds)
1. Go to `app.myrewrd.com/dashboard/tv-board`
2. Click "Connect a TV" → "Add New Device"
3. Enter the 6-digit code shown on the TV
4. Device is now paired and shows the venue's TV Board

### Step 4: Game Day Setup (one-time, 2 minutes)
1. On the TV Box, open Chrome (via dashboard "Open Browser" button)
2. Log into YouTube TV / Hulu / ESPN with the venue's account
3. Session persists — no need to log in again

### Total setup time: ~5 minutes

---

## How Game Day Mode Works for the Venue

### From the Dashboard:
1. Go to TV Board → Game Day Mode card
2. Toggle ON
3. Select the stream source (YouTube TV, Hulu, ESPN)
4. The TV Box automatically switches to Game Day layout:
   - Full-screen game (94%)
   - Sponsor bar at bottom (6%): "🏈 Live NFL Sponsored by [RED BULL]"
5. When the game ends, toggle OFF → TV reverts to normal TV Board

### From the Venue App (future):
- Staff can toggle Game Day mode from their phone
- Select which game to display
- Switch between TVs

---

## Business Model — How to Sell This to Venues

### Pricing Options:

**Option A: Hardware + Monthly Service**
| Item | Price |
|------|-------|
| TV Box device (one-time) | $299 |
| Monthly service fee (includes Game Day, updates, support) | $49/mo |
| Game Day Sponsor Placement (per season) | $2,500-5,000 |

**Option B: Free Hardware, Monthly Subscription**
| Item | Price |
|------|-------|
| TV Box device | FREE (with 12-month commitment) |
| Monthly subscription | $79/mo |
| Game Day Sponsor Placement (per season) | $2,500-5,000 |

**Option C: Revenue Share (Atmosphere TV model)**
| Item | Price |
|------|-------|
| TV Box device | FREE |
| Monthly fee | FREE |
| You take 30% of sponsor revenue from Game Day placements | Variable |

### Recommended: Option A for launch
- $299 hardware sale gives you immediate revenue
- $49/mo is low enough that venues don't think twice
- Game Day sponsor revenue is the real money maker

### Sponsor Revenue Potential:

| Metric | Value |
|--------|-------|
| NFL season | 18 weeks (Sep–Jan) |
| Games per week | 3-4 (Sunday, Monday, Thursday) |
| Hours per game | ~3 hours |
| Sponsor exposure per game | 3 hours of persistent branding |
| Sponsor exposure per season | ~200+ hours |
| Comparable billboard cost | $5,000-15,000/month |
| **Your Game Day sponsor rate** | **$2,500-5,000/season** |

With 100 venues:
- Hardware revenue: 100 × $299 = $29,900 (one-time)
- Monthly service: 100 × $49 = $4,900/mo ($58,800/year)
- Sponsor revenue: 100 × $3,500 = $350,000/season
- **Total Year 1: ~$438,700**

---

## Competitive Landscape

| Company | What they do | Price | Key difference from us |
|---------|-------------|-------|----------------------|
| **Atmosphere TV** | Free streaming content for bars (no sports) | Free device + $0/mo (ad-supported) | No live sports, no sponsor customization |
| **UPshow** | Digital signage + engagement | ~$100-200/mo | No live streaming, no Game Day mode |
| **Rockbot** | Music + TV for bars | ~$75-150/mo | Music-focused, limited sponsor features |
| **Raydiant** | Digital signage platform | ~$25-50/screen/mo | Generic signage, no sports integration |
| **myREWRD TV Box** | Live sports + sponsor overlay + venue branding | $299 + $49/mo | **Only solution combining live NFL + sponsor overlay + venue loyalty platform** |

**Our unique advantage:** We're the only platform that combines:
1. Live sports streaming with sponsor overlay
2. Venue-specific branding and artist lineup
3. Integration with the full myREWRD loyalty/engagement platform
4. Sponsor revenue that pays for itself

---

## Sales Pitch to Venues

> "You're already paying $200-400/month for cable to show NFL games. What if that same TV could also generate $2,500-5,000 in sponsor revenue per season? 
>
> The myREWRD TV Box plugs into your TV, shows the game full-screen, and adds a small sponsor bar at the bottom — like a stadium banner. Your sponsor pays for the premium placement during peak traffic (NFL Sundays), and you keep the revenue.
>
> When there's no game, the same device shows your regular TV Board — tonight's lineup, upcoming events, artist images, and your venue branding. One device, two revenue streams."

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VENUE TV                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │              GAME / STREAM CONTENT                        │  │
│  │         (YouTube TV / Hulu / ESPN / Twitch)               │  │
│  │                                                           │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ 🏈 LIVE NFL SPONSORED BY  │  [RED BULL LOGO]  RED BULL   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         ▲                              ▲
         │ HDMI                         │ WiFi
         │                              │
┌────────┴────────┐           ┌────────┴────────┐
│  myREWRD TV Box │◄──────────│  myREWRD Cloud  │
│  (Electron App) │  WebSocket│  (Dashboard)    │
│  Intel N100     │           │  app.myrewrd.com│
│  8GB RAM        │           └─────────────────┘
│  WiFi 6         │                    ▲
└─────────────────┘                    │
                                       │ HTTPS
                              ┌────────┴────────┐
                              │  Venue Staff    │
                              │  (Phone/Laptop) │
                              └─────────────────┘
```

---

## Timeline & Next Steps

### Phase 1: Pilot (Now – September 2026)
- [x] Game Day Mode built and deployed
- [x] Electron app created (GitHub: myREWRD/myrewrd-tv-box)
- [ ] Order 5 Beelink Mini S12 Pro units from Amazon ($845)
- [ ] Pre-configure with myREWRD software
- [ ] Deploy to 2-3 test venues (Sugarshack, Backyard Social)
- [ ] Test with NFL preseason games (Aug 8 – Aug 24)

### Phase 2: NFL Season Launch (September 2026)
- [ ] Order 20-50 units from Alibaba ($2,700-6,750)
- [ ] Sell Game Day sponsor packages to Red Bull, local breweries
- [ ] Deploy to all active venues
- [ ] Chrome Extension available for venues without dedicated box

### Phase 3: Scale (January 2027+)
- [ ] Custom-branded devices (myREWRD logo on hardware)
- [ ] Pre-loaded OS image (zero-touch deployment)
- [ ] Expand to NBA, NHL, MLB, college sports
- [ ] Multi-TV support (different games on different screens)
- [ ] Venue app remote control

---

## FAQ

**Q: Can venues use their existing Fire Stick/Apple TV?**
A: No — Fire Stick and Apple TV don't support our overlay software. The myREWRD TV Box is a dedicated device that runs our app natively. However, venues can use the Chrome Extension on any computer connected to a TV as an interim solution.

**Q: What about DRM? Can we stream YouTube TV?**
A: Yes. The Electron app uses Chromium with Widevine DRM support — the same engine Chrome uses. YouTube TV, Hulu, ESPN+, and all major streaming services work correctly.

**Q: What if the venue's internet goes down?**
A: The TV Box will show a "Connection Lost" screen and automatically reconnect when internet returns. The regular TV Board content is cached locally for offline display.

**Q: Can the venue use this for non-sports content?**
A: Absolutely. Game Day mode works with any stream URL — YouTube Live, Twitch, concerts, pay-per-view events. The sponsor overlay works the same regardless of content.

**Q: How do we update the software remotely?**
A: The Electron app has a built-in auto-updater. Push a new version to our update server → all devices update automatically overnight.
