import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ProgramDetail } from './ProgramDetail.js';
import { ProgramList } from './ProgramList.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProgramList />} />
        <Route path="/programs/:id" element={<ProgramDetail />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
