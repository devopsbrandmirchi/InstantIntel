# Instant Intel

React web app for RV dealer operations: inventory and sales reporting, client assignments, and team management, backed by **Supabase** (auth and data).

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Supabase (Authentication)**
   - Create a project at [supabase.com](https://supabase.com) if you haven’t already.
   - In the Supabase Dashboard go to **Settings → API** and copy:
     - **Project URL** → `VITE_SUPABASE_URL`
     - **anon public** key → `VITE_SUPABASE_ANON_KEY`
   - Copy `.env.example` to `.env` and fill in your values:
     ```bash
     cp .env.example .env
     ```
   - In Supabase **Authentication → Providers**, ensure **Email** is enabled. You can disable **Confirm email** if you want immediate sign-in after signup.
   - **To make a user an Admin**: In Supabase go to **Authentication → Users** → select the user → **Edit** → under **Raw User Meta Data** add `{"role": "admin"}` (or add `"role": "admin"` to existing JSON). Save. That user will see **User Management** in the sidebar and can create new users.

3. **Start Development Server**
   ```bash
   npm run dev
   ```

   The application will open at `http://localhost:3000`

4. **Build for Production**
   ```bash
   npm run build
   ```

5. **Preview Production Build**
   ```bash
   npm run preview
   ```

## Project Structure

```
src/
├── components/          # Reusable React components
│   ├── Login.jsx       # Login page component
│   ├── Sidebar.jsx     # Sidebar navigation component
│   └── Layout.jsx      # Main layout wrapper
├── contexts/           # React Context providers
│   └── AuthContext.jsx # Authentication context
├── pages/             # Page components
│   ├── Dashboard.jsx
│   ├── Profile.jsx
│   ├── Clients.jsx
│   ├── Roles.jsx
│   ├── Inventory.jsx
│   └── InventoryReport.jsx
├── App.jsx            # Main App component with routing
├── main.jsx           # Application entry point
└── index.css          # Global styles with Tailwind

```

## Features

- ✅ React Router for navigation
- ✅ **Supabase** token-based authentication (JWT)
- ✅ Protected routes
- ✅ Responsive sidebar with submenu support
- ✅ Dashboard with statistics
- ✅ Inventory Report with charts and tables
- ✅ Tailwind CSS for styling
- ✅ Chart.js integration for data visualization

## Authentication (Supabase)

- **Login** uses Supabase Auth with **email + password** and returns a JWT session.
- **Sign up**: Public signup at `/signup` (full name, email, password). If Supabase “Confirm email” is off, the user is signed in and redirected to the dashboard; otherwise they are redirected to login after confirming their email.
- **Admin creating users**: Users with `user_metadata.role === 'admin'` see **User Management** in the sidebar. They can open **Add User** and create new users (email, password, full name, role). New users can sign in with those credentials.
- The app stores the session (access token) in memory; Supabase persists it in `localStorage` and refreshes it automatically.
- Use `getAuthToken()` from `useAuth()` when calling your own APIs; send it as `Authorization: Bearer <token>`.
- Logout calls `supabase.auth.signOut()` and clears the session.

## Technologies Used

- React 18
- React Router DOM
- **Supabase** (auth + optional backend)
- Vite (Build tool)
- Tailwind CSS
- Chart.js / react-chartjs-2
- Font Awesome Icons

## Notes

- The old vanilla JavaScript files (`js/app.js`, `css/style.css`) are kept for reference but are no longer used
- All functionality has been converted to React components
- Authentication state is managed through React Context
- All routes are protected and require authentication
