import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AnnouncementModal from './components/AnnouncementModal';
import PopoutView from './components/PopoutView';
import { IS_POPOUT } from './stores/appStore';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {IS_POPOUT ? (
      <PopoutView />
    ) : (
      <>
        <App />
        <AnnouncementModal />
      </>
    )}
  </React.StrictMode>,
);
