import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AnnouncementModal from './components/AnnouncementModal';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <AnnouncementModal />
  </React.StrictMode>,
);
