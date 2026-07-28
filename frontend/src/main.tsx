import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AnnouncementModal from './components/AnnouncementModal';
import PopoutView from './components/PopoutView';
import { IS_POPOUT } from './stores/appStore';
import { ensureLocalSession } from './lib/localAuth';
import './index.css';

// Mount only once the local session cookie is in place: the self-hosted API
// rejects requests without it, so the app's first fetch must not race this.
// (Not top-level await -- that outruns the browser targets Vite builds for.)
ensureLocalSession().then(() => {
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
});
