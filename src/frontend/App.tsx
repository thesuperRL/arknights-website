import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import NicheListPage from './pages/NicheListPage';
import TrashOperatorsPage from './pages/TrashOperatorsPage';
import OperatorPage from './pages/OperatorPage';
import AllOperatorsPage from './pages/AllOperatorsPage';
import LocalLoginPage from './pages/LocalLoginPage';
import RegisterPage from './pages/RegisterPage';
import UserProfilePage from './pages/UserProfilePage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app">
          <Navbar />
          <main className="main-content">
            <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/niche-list/:niche" element={<NicheListPage />} />
            <Route path="/trash-operators" element={<TrashOperatorsPage />} />
            <Route path="/operator/:id" element={<OperatorPage />} />
            <Route path="/all-operators" element={<AllOperatorsPage />} />
            <Route path="/login" element={<LocalLoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/profile" element={<UserProfilePage />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

