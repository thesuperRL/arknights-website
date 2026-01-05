import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import Navbar from './components/Navbar';
import LanguageSelector from './components/LanguageSelector';
import HomePage from './pages/HomePage';
import TierListsPage from './pages/TierListsPage';
import NicheListPage from './pages/NicheListPage';
import TrashOperatorsPage from './pages/TrashOperatorsPage';
import FreeOperatorsPage from './pages/FreeOperatorsPage';
import GlobalRangeOperatorsPage from './pages/GlobalRangeOperatorsPage';
import UnconventionalNichesPage from './pages/UnconventionalNichesPage';
import LowRarityPage from './pages/LowRarityPage';
import OperatorPage from './pages/OperatorPage';
import AllOperatorsPage from './pages/AllOperatorsPage';
import LocalLoginPage from './pages/LocalLoginPage';
import RegisterPage from './pages/RegisterPage';
import UserProfilePage from './pages/UserProfilePage';
import TeamBuilderPage from './pages/TeamBuilderPage';
import IntegratedStrategiesPage from './pages/IntegratedStrategiesPage';
import './App.css';
import './pages/AllOperatorsPage.css';
import './pages/NicheListPage.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
          <div className="app">
            <Navbar />
            <main className="main-content">
              <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/tier-lists" element={<TierListsPage />} />
              <Route path="/niche-list/:niche" element={<NicheListPage />} />
              <Route path="/trash-operators" element={<TrashOperatorsPage />} />
              <Route path="/free-operators" element={<FreeOperatorsPage />} />
              <Route path="/global-range-operators" element={<GlobalRangeOperatorsPage />} />
              <Route path="/unconventional-niches-operators" element={<UnconventionalNichesPage />} />
              <Route path="/low-rarity-operators" element={<LowRarityPage />} />
              <Route path="/operator/:id" element={<OperatorPage />} />
              <Route path="/all-operators" element={<AllOperatorsPage />} />
              <Route path="/login" element={<LocalLoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/profile" element={<UserProfilePage />} />
              <Route path="/team-builder" element={<TeamBuilderPage />} />
              <Route path="/integrated-strategies" element={<IntegratedStrategiesPage />} />
              </Routes>
            </main>
            <LanguageSelector />
          </div>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

