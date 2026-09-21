import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { AlertasProvider } from './context/AlertasContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AlertasProvider>
          <App />
        </AlertasProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
