# Reservation capability matrix

| Step                     | Current source                | What the user may see                                          | Current limit                                                                        |
| ------------------------ | ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Area and venue discovery | Geoapify                      | Nearby restaurant or café candidates tied to one resolved area | Place listings do not establish booking inventory.                                   |
| Booking source discovery | Browserbase web search        | Candidate reservation pages for that venue or area             | A search result is not proof that the page belongs to the venue or has availability. |
| Live times               | SevenRooms browser inspection | Times only after requested date and party filters are verified | Other providers, including observed Toast, remain unverified.                        |
| Checkout handoff         | SevenRooms browser session    | Selected venue, date, party, time, and checkout view           | Stops before guest details, payment, or final submission.                            |
| Completed booking        | None                          | No confirmation claim                                          | Requires a separate provider-confirmed result.                                       |

Each reservation stop gets its own area, venue, date, party size, source, and evidence status. The adapter may fill gaps in venue discovery; it must not infer availability from Geoapify or a booking link.
