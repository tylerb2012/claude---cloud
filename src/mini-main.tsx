/** Entry for the paper mini app (Discover, Bot, Wallet, Profile). Play money only: no wallet, keys or network. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MiniApp } from './mini/MiniApp';
import './styles.css';
import './mini/mini.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MiniApp />
  </StrictMode>,
);
