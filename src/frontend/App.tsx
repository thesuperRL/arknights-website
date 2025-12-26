import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import NicheListPage from './pages/NicheListPage';
import TrashOperatorsPage from './pages/TrashOperatorsPage';
import OperatorPage from './pages/OperatorPage';
import AllOperatorsPage from './pages/AllOperatorsPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/niche-list/:niche" element={<NicheListPage />} />
            <Route path="/trash-operators" element={<TrashOperatorsPage />} />
            <Route path="/operator/:id" element={<OperatorPage />} />
            <Route path="/all-operators" element={<AllOperatorsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

