# Concierge

A conversational concierge for finding places and exploring reservations.

[Open the app](https://concierge-pearl.vercel.app)

## Architecture

```mermaid
flowchart LR
    UI["Frontend<br/>Chat · maps · calendar · passport"]

    subgraph Backend
        Auth["Auth<br/>Session checks · /api/auth/*"]
        Chat["POST /api/chat<br/>Validate context · stream responses"]
        Agent["Agent<br/>Prompt + preferences · model · tool loop"]
        Tools["Tools<br/>Place search · reservation inspection<br/>Checkout handoff · follow-up questions"]
        Busy["GET /api/calendar/busy<br/>Read schedule conflicts"]
        Preview["GET /api/reservations/view<br/>Authorize browser preview / checkout"]
        Links["GET /api/link-preview<br/>Read page metadata"]
        Profile["Page loads + form actions<br/>Preferences · passport entries"]
    end

    Store[("Store<br/>Accounts · sessions · preferences · passport")]
    Places["Place endpoints<br/>Geocoding · nearby venues"]
    Browser["Browser endpoints<br/>Page discovery · inspection · checkout"]
    Calendar["Calendar endpoints<br/>Calendar list · free/busy"]
    Metadata["Metadata endpoint<br/>Title · description · image"]

    UI --> Auth
    Auth --> Store
    UI --> Chat & Busy & Preview & Links & Profile
    Chat --> Agent
    Store -->|Preferences| Agent
    Agent --> Tools
    Tools --> Places & Browser
    Busy --> Calendar
    Preview --> Browser
    Links --> Metadata
    Profile --> Store
```

## Reservation services

- [OpenTable](https://www.opentable.com/)
- [SevenRooms](https://sevenrooms.com/)
