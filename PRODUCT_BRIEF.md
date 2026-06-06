# Barrel Proof - Product Brief

## Core Thesis

Barrel Proof is a private bourbon intelligence app for the bottle decision in
front of you, the shelf you are building, and the friends you trust.

Most bourbon apps are either public review databases, collection ledgers, price
references, or marketplace tools. Barrel Proof should combine those jobs into a
more personal workflow:

> Should I buy this bottle, at this price, for my palate and my group?

## First Audience

Start with Joe and friends.

The app should feel useful before it ever becomes public. The first win is a
group of bourbon friends opening it in a store, at home, or during a tasting
night and feeling like it was made for exactly how they talk about bottles.

## Product Promise

Open the app, look up a bottle, enter the shelf price, and get a clear Buy /
Consider / Pass call with reasons.

The app should answer:

- Is this a good bottle?
- Is this a good bottle at this price?
- Do I already own it?
- Does it fit my palate?
- Did my friends like it?
- Is this hype, value, or a real find?
- What should we pour tonight?

## MVP Workflow

1. User opens Store Mode.
2. User searches a bottle from the seeded catalog.
3. User enters the store price.
4. App generates a decision card:
   - Buy / Consider / Pass
   - confidence score
   - price position versus MSRP and fair value
   - palate fit
   - friend signal
   - shelf status
   - short reasons and cautions
5. User can add it to shelf, wishlist, or pass list.
6. User can log a tasting note and rating later.

## Data Principles

- Keep bottle identity clean: brand, expression, batch, proof, age, distillery,
  producer, mash bill, price references, and flavor profile.
- Treat store picks, yearly releases, batches, and proof variants as distinct
  expressions when they matter.
- Store user data with a version number from day one.
- Keep recommendation logic separate from UI.
- Make import/export easy before the data becomes precious.

## Differentiation

Barrel Proof should not be just another inventory app.

The differentiator is the decision layer:

- price-aware
- palate-aware
- friend-aware
- shelf-aware
- honest about confidence

The app can say, "Great bottle, bad price" or "Not rare, but perfect for your
palate and worth grabbing at this price."

## First Build Scope

- Premium mobile-first shell.
- Store Mode with search, price input, bottle selection, and decision card.
- Seeded bourbon catalog.
- Shelf, wishlist, passed, and tasted statuses.
- Tasting notes and score logging.
- Friend signals from seeded private group data.
- Collection insights.
- Local storage with versioned state.
- Focused tests for recommendation logic.

## Later

- Barcode scan.
- Label photo recognition.
- Live price data.
- Public review ingestion.
- Friend accounts or shareable private group files.
- Blind tasting night mode.
- Bottle comparison.
- Pour picker.
- Release calendar.
- Store/hunt notes by location.
