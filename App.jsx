import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import QuizCard from './components/QuizCard';
import PollFeed from './components/PollFeed';
import AuthModal from './components/AuthModal';
import CreatePollModal from './components/CreatePollModal';
import { pollAPI } from './services/api';
import { useAuth } from './context/AuthContext';
import { Sparkles, Layers, RefreshCw, Smartphone } from 'lucide-react';

export default function App() {
  const { user } = useAuth();
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPollIndex, setCurrentPollIndex] = useState(0);
  const [currentView, setCurrentView] = useState('QUIZ'); // 'QUIZ' or 'FEED'
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const fetchPolls = async () => {
    try {
      setLoading(true);
      const res = await pollAPI.getAll();
      if (res.data.success) {
        setPolls(res.data.polls);

        // If currently viewing a poll that no longer exists or first load, keep index safe
        if (res.data.polls.length > 0) {
          // Find the seeded "Which color do you like the most?" poll as preferred initial poll
          const colorPollIdx = res.data.polls.findIndex((p) =>
            p.question.toLowerCase().includes('color')
          );
          if (colorPollIdx !== -1 && currentPollIndex === 0) {
            setCurrentPollIndex(colorPollIdx);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load polls:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolls();
  }, [user]);

  const activePoll = polls[currentPollIndex] || null;

  const handleNextPoll = () => {
    if (polls.length > 0) {
      setCurrentPollIndex((prev) => (prev + 1) % polls.length);
    }
  };

  const handleSelectPollFromFeed = (poll) => {
    const idx = polls.findIndex((p) => p._id === poll._id);
    if (idx !== -1) {
      setCurrentPollIndex(idx);
    }
    setCurrentView('QUIZ');
  };

  const handlePollCreated = (newPoll) => {
    fetchPolls();
    setCurrentView('QUIZ');
    // Set to new poll once fetched
  };

  return (
    <div className="min-h-screen bg-yellow-canvas flex flex-col justify-between selection:bg-black selection:text-[#ffc200]">
      {/* Top Navigation */}
      <Navbar
        currentView={currentView}
        onViewChange={setCurrentView}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenCreate={() => setIsCreateOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {currentView === 'QUIZ' ? (
          <div className="w-full flex flex-col items-center animate-in fade-in duration-300">
            {/* Context tag */}
            <div className="mb-4 inline-flex items-center gap-2 px-3 py-1 bg-black text-[#ffc200] rounded-full text-xs font-black shadow-[3px_3px_0px_#fff]">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Interactive Quiz & Poll Card View</span>
              <span className="text-white/60">
                ({currentPollIndex + 1} of {polls.length})
              </span>
            </div>

            {loading && polls.length === 0 ? (
              <div className="w-full max-w-[420px] bg-white rounded-[32px] p-12 border-3 border-black shadow-[10px_12px_0px_#000] text-center font-black">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-black" />
                Loading Quiz Card...
              </div>
            ) : (
              <QuizCard
                poll={activePoll}
                onPollUpdated={fetchPolls}
                onNextPoll={handleNextPoll}
                onOpenAuth={() => setIsAuthOpen(true)}
              />
            )}
          </div>
        ) : (
          <div className="w-full animate-in fade-in duration-300">
            <PollFeed
              polls={polls}
              loading={loading}
              onSelectPoll={handleSelectPollFromFeed}
              onCreatePollClick={() => setIsCreateOpen(true)}
              onFilterChange={setActiveFilter}
              activeFilter={activeFilter}
            />
          </div>
        )}
      </main>

      {/* Bottom Footer Info */}
      <footer className="w-full max-w-4xl mx-auto px-4 py-4 text-center">
        <div className="inline-block px-4 py-2 bg-white/80 backdrop-blur-xs rounded-2xl border-2 border-black text-xs font-bold text-black shadow-[4px_4px_0px_#000]">
          Case Study #166: Online Poll and Survey Creation Tool • Express.js + Mongoose Aggregation ($group) + React
        </div>
      </footer>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      <CreatePollModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onPollCreated={handlePollCreated}
        onOpenAuth={() => setIsAuthOpen(true)}
      />
    </div>
  );
}
