# HomeNest MVP

A full-stack starter for an apartment-rental marketplace.

## Included
- Renter registration/login
- Landlord registration/login
- Apartment listings with search filters
- Listing detail pages
- Favorites
- Landlord inquiries
- Tour requests
- Landlord dashboard
- Create/publish listing form
- SQLite database with seed data

## Run locally

1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run:
   npm install
4. Start:
   npm start
5. Visit:
   http://localhost:3000

Demo accounts:
- Renter: renter@homenest.demo / Demo1234!
- Landlord: landlord@homenest.demo / Demo1234!

## Production notes
This is an MVP foundation, not a production deployment. Before launch, replace the JWT secret, use HTTPS, validate uploads, add rate limiting, CSRF protection where appropriate, stronger authorization/audit controls, secure image storage, transactional email, production database hosting/backups, and legal/compliance review for housing listings, applications, screening, payments, privacy and fair-housing requirements.

The map is intentionally a UI placeholder. A production map can be connected to a mapping provider after selecting the provider and obtaining credentials.
