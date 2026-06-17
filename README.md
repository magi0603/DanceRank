# DanceRank

DanceRank is a web application for managing ballroom dance competitions and collecting judge scores during qualification and final rounds.

The system has two main roles:
- `Admin`: creates competitions, configures judges and categories, manages rounds, and reviews results.
- `Judge`: signs in with a private code and PIN, then submits selections or final rankings for the assigned competition.

## Features

- Competition-based admin workspace
- Secure admin login with signed cookie sessions
- Judge login with code and PIN
- Competition creation with judges, categories, dances, finalists, and competitor numbers
- Automatic round generation based on competitor count
- Round control for activating and completing rounds
- Qualification scoring by selections
- Final scoring by placements/rankings
- Final results aggregation across judges
- Competition search in the admin area
