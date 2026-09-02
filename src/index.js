import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import VersionUpdateNotice from './comunes/componentes/VersionUpdateNotice';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <>
      <App />
      <VersionUpdateNotice />
    </>
  </React.StrictMode>
);
