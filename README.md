# Red Cross Camarines Sur Scheduling System

A modern duty scheduling system built with React + Supabase for Red Cross Camarines Sur Chapter.

![Red Cross](https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Flag_of_the_Red_Cross.svg/200px-Flag_of_the_Red_Cross.svg.png)

## Features

- 🔐 **Authentication** - Secure login with role-based access (Admin/Staff)
- 👥 **Personnel Management** - Manage volunteers and staff profiles
- 📅 **Scheduling** - Assign duties with calendar views (daily/weekly/monthly)
- ✅ **Attendance Tracking** - Check-in/out with status monitoring
- 🔄 **Shift Swaps** - Request and approve shift exchanges
- 📊 **Dashboard** - Overview of today's roster and pending actions

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Supabase (PostgreSQL + Auth)
- **Styling**: Custom CSS
- **Icons**: Lucide React
- **Date Handling**: date-fns

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- Supabase account (free tier available)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/Red-Cross-Camarines-Sur-Scheduling-System.git
cd Red-Cross-Camarines-Sur-Scheduling-System
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once created, go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Go to **Settings > API** and copy your:
   - Project URL
   - Anon/Public key

### 4. Configure environment

Create a `.env.local` file in the project root:

```env
VITE_SUPABASE_URL=your_project_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### 5. Create an admin user

1. In Supabase, go to **Authentication > Users**
2. Click **Add User** and create an admin account
3. Copy the User UID
4. In **SQL Editor**, run:

```sql
INSERT INTO personnel (id, name, email, role, is_active) 
VALUES ('YOUR-USER-UID', 'Admin Name', 'admin@email.com', 'admin', true);
```

### 6. Run the development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Project Structure

```
src/
├── components/       # Reusable UI components
│   ├── Modal.jsx
│   └── Sidebar.jsx
├── context/          # React Context providers
│   └── AuthContext.jsx
├── lib/              # External service configs
│   └── supabase.js
├── pages/            # Application pages
│   ├── Attendance.jsx
│   ├── Dashboard.jsx
│   ├── Login.jsx
│   ├── Personnel.jsx
│   ├── Schedule.jsx
│   └── Swaps.jsx
├── App.jsx           # Main app with routing
├── index.css         # Global styles
└── main.jsx          # Entry point
```

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Add environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
5. Deploy!

## License

MIT License - feel free to use for your organization.

---

Built with ❤️ for Red Cross Camarines Sur
