# Ergon

A desktop application to manage and run your development projects with ease.

## Features

- 📁 **Manage Projects**: Add, edit, and delete projects with their paths
- 🚀 **Start/Stop Servers**: Start and stop backend and frontend servers with one click
- 🗂️ **Open in Explorer**: Click on project path to open it in Windows Explorer
- 🎨 **Visual Design**: Modern UI with color-coded projects and status indicators
- 💾 **Persistent Storage**: Your projects are saved locally
- 🔄 **Process Management**: Automatically tracks running processes

## Installation

1. Install dependencies:
```bash
npm install
```

2. Run the application:
```bash
npm start
```

## Usage

### Adding a Project

1. Click "Add Project" button
2. Fill in the project details:
   - **Name**: Your project name
   - **Path**: Full path to your project folder (e.g., `D:/projects/my-app`)
   - **Backend Command**: Command to start backend (e.g., `npm run dev`, `python app.py`)
   - **Frontend Command**: Command to start frontend (e.g., `npm start`, `npm run serve`)
   - **Color**: Choose a color to identify your project
3. Click "Save Project"

### Managing Projects

- **Open in Explorer**: Click on the project path to open it in Windows Explorer
- **Start Services**: Click "Start" button for backend or frontend
- **Stop Services**: Click "Stop" button to stop running services
- **Edit**: Click the edit icon (✏️) to modify project details
- **Delete**: Click the delete icon (🗑️) to remove a project

### Project Status

- **Green indicator**: One or more services are running
- **Gray indicator**: All services are stopped

## Common Commands

Here are some common commands you might use:

### Backend
- Node.js: `npm run dev`, `node server.js`, `nodemon index.js`
- Python: `python app.py`, `flask run`, `uvicorn main:app --reload`
- Java: `mvn spring-boot:run`, `gradle bootRun`

### Frontend
- React: `npm start`, `npm run dev`
- Vue: `npm run serve`, `npm run dev`
- Angular: `ng serve`
- Vite: `npm run dev`

## Tips

- Make sure the project paths exist before adding them
- Commands are executed from the project directory
- All running processes are automatically stopped when you close the app
- Use different colors for different types of projects for easy identification

## Development

To run in development mode with DevTools:
```bash
npm run dev
```

## License

MIT
