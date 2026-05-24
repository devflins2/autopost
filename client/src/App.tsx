import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { LayoutDashboard, Image as ImageIcon, Video, Music, Calendar, Settings, Bell, Search, Loader2, X, Send, CheckCircle2, Terminal, BarChart3, Users, Eye, Bookmark, Menu, ArrowRight, Zap, RefreshCw, Lock, Cloud, Heart, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Global Axios Config for Flora
axios.defaults.baseURL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '');


interface MediaItem {
  id: string;
  url: string;
  previewUrl: string;
  source: string;
  resource_type?: string;
}

interface LogEntry {
  _id: string;
  message: string;
  level: string;
  createdAt: string;
}

interface StatsData {
  totalPosts: number;
  totalReach: number;
  totalViews: number;
  totalLikes: number;
  nextRunTime?: string;
  recentPosts: any[];
}

interface HistoryDay {
  date: string;
  posts: number;
  reach: number;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [images, setImages] = useState<MediaItem[]>([]);
  const [cloudPool, setCloudPool] = useState<MediaItem[]>([]);
  const [localPool, setLocalPool] = useState<MediaItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [caption, setCaption] = useState('Nature is calling... 🌸✨ #flora #automation');
  const [posting, setPosting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [nextPostTime, setNextPostTime] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [verifyPass, setVerifyPass] = useState(false);
  
  const [stats, setStats] = useState<StatsData>({
    totalPosts: 0,
    totalReach: 0,
    totalViews: 0,
    totalLikes: 0,
    recentPosts: []
  });

  // Settings states
  const [settings, setSettings] = useState({
    metaAccessToken: '',
    instagramAccountId: '',
    facebookPageId: '',
    telegramBotToken: '',
    telegramChatId: '',
    hfToken: '',
    pexelsApiKey: '',
    pixabayApiKey: '',
    songLinks: ''
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Diagnostic states
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const [testingMeta, setTestingMeta] = useState(false);

  const discoveryKeywords = useMemo(() => ['forest', 'mountains', 'ocean', 'wildlife', 'landscape', 'waterfall', 'desert'], []);

  // Update Axios Header whenever password changes or on load
  const setAuthHeader = useCallback((token: string) => {
    if (token) {
      axios.defaults.headers.common['x-dashboard-password'] = token;
    }
  }, []);

  const fetchMedia = useCallback(async (searchQuery: string = query) => {
    setLoading(true);
    try {
      const q = searchQuery || discoveryKeywords[Math.floor(Math.random() * discoveryKeywords.length)];
      const res = await axios.get(`/api/media/images?query=${q}`);
      if (res.data.success) setImages(res.data.data);
    } catch (error) {
      console.error('Fetch Media Error:', error);
    } finally {
      setLoading(false);
    }
  }, [query, discoveryKeywords]);

  const fetchCloudPool = useCallback(async () => {
    try {
      const res = await axios.get('/api/media/imagekit-pool'); // Switched to ImageKit as Cloudinary was replaced
      if (res.data.success) setCloudPool(res.data.data);
    } catch (error) {
      console.error('Fetch Cloud Pool Error:', error);
    }
  }, []);

  const fetchLocalPool = useCallback(async () => {
    try {
      const res = await axios.get('/api/media/local-pool');
      if (res.data.success) setLocalPool(res.data.data);
    } catch (error) {
      console.error('Fetch Local Pool Error:', error);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await axios.get('/api/logs');
      if (res.data.success) setLogs(res.data.data);
    } catch (error: any) {
      if (error.response?.status === 401) {
        localStorage.removeItem('flora_pass');
        setIsAuthenticated(false);
      }
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get('/api/stats/overview');
      setStats(res.data);
    } catch (error) {
      console.error('Fetch Stats Error:', error);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await axios.get('/api/stats/history');
      if (res.data.success) setHistory(res.data.data);
    } catch (error) {
      console.error('Fetch History Error:', error);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await axios.get('/api/settings');
      if (res.data.success) {
        setSettings(res.data.data);
      }
    } catch (error) {
      console.error('Fetch Settings Error:', error);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsError('');
    setSettingsSuccess(false);
    try {
      const res = await axios.post('/api/settings', settings);
      if (res.data.success) {
        setSettingsSuccess(true);
        setTimeout(() => setSettingsSuccess(false), 3000);
        // Refresh to get new masked keys
        fetchSettings();
      }
    } catch (error: any) {
      setSettingsError(error.response?.data?.error || 'Failed to save configurations');
    } finally {
      setSettingsSaving(false);
    }
  };

  const runMetaDiagnostics = async () => {
    setTestingMeta(true);
    setDiagnosticLogs([
      '🚀 Initiating Meta Integration Diagnostic Audit...',
      '📡 Querying configuration parameters from MongoDB...'
    ]);
    try {
      const res = await axios.post('/api/settings/test-meta');
      if (res.data.success) {
        setDiagnosticLogs(res.data.logs);
      } else {
        setDiagnosticLogs(prev => [...prev, '❌ Diagnostics failed: ' + (res.data.error || 'Unknown server error')]);
      }
    } catch (error: any) {
      setDiagnosticLogs(prev => [...prev, '❌ Diagnostics network failure: ' + (error.response?.data?.error || error.message || 'Network Timeout')]);
    } finally {
      setTestingMeta(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setAuthHeader(password);
    axios.get('/api/stats/overview')
      .then(() => {
        localStorage.setItem('flora_pass', password);
        setIsAuthenticated(true);
        setLoginError(false);
      })
      .catch(() => {
        setLoginError(true);
        setAuthHeader('');
      })
      .finally(() => setIsVerifying(false));
  };

  useEffect(() => {
    const savedPass = localStorage.getItem('flora_pass');
    if (savedPass) {
      setAuthHeader(savedPass);
      axios.get('/api/stats/overview')
        .then(() => setIsAuthenticated(true))
        .catch(() => {
           localStorage.removeItem('flora_pass');
           setIsAuthenticated(false);
        });
    }
  }, [setAuthHeader]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchMedia();
      fetchCloudPool();
      fetchLocalPool();
      fetchLogs();
      fetchStats();
      fetchHistory();
      fetchSettings();

      const handleResize = () => setIsMobile(window.innerWidth < 1024);
      window.addEventListener('resize', handleResize);

      const interval = setInterval(() => {
        fetchLogs();
        fetchStats();
        
        if (stats.nextRunTime && (stats as any).serverTime) {
          const next = new Date(stats.nextRunTime).getTime();
          const serverNow = (stats as any).serverTime;
          
          // Calculate how many ms are left according to the server
          const msLeft = next - serverNow;
          
          // Apply that remaining time to our local countdown
          if (msLeft > 0) {
            const hours = Math.floor(msLeft / 3600000);
            const mins = Math.floor((msLeft % 3600000) / 60000);
            const secs = Math.floor((msLeft % 60000) / 1000);
            if (hours > 0) {
              setNextPostTime(`${hours}h ${mins}m`);
            } else {
              setNextPostTime(`${mins}m ${secs}s`);
            }
          } else {
            setNextPostTime('Processing...');
          }
        } else {
          setNextPostTime('Syncing...');
        }
      }, 1000);

      return () => {
        clearInterval(interval);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isAuthenticated, fetchMedia, fetchCloudPool, fetchLogs, fetchStats, fetchSettings]);

  const handleQuickPublish = async () => {
    if (!selectedMedia) return;
    setPosting(true);
    try {
      await axios.post('/api/posts/quick-publish', {
        mediaUrl: selectedMedia.url,
        mediaType: selectedMedia.resource_type === 'video' || selectedMedia.url.includes('.mp4') ? 'video' : 'image',
        description: caption,
        platform: 'both'
      });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setSelectedMedia(null);
      setVerifyPass(false);
      fetchLogs();
      fetchStats();
      fetchCloudPool();
    } catch (error) {
      console.error('Quick Publish Error:', error);
      alert('Security Check Failed or Network Error');
    } finally {
      setPosting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="h-screen bg-[#030712] flex items-center justify-center p-6 font-sans">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md p-10 glass-card text-center border-primary-500/10">
          <div className="w-20 h-20 rounded-[2rem] bg-primary-600 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-primary-500/20 relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
            <Lock size={36} className="text-white relative z-10" />
          </div>
          <h2 className="text-4xl font-black text-white mb-2 tracking-tighter">Flora Admin</h2>
          <p className="text-gray-500 text-sm mb-10 font-medium">Verify identity to access auto-pilot.</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <input 
              type="password" 
              placeholder="Enter Admin Password" 
              className={`w-full bg-white/5 border ${loginError ? 'border-red-500/40' : 'border-white/10'} rounded-2xl py-5 px-6 text-center focus:border-primary-500 outline-none transition-all placeholder:text-gray-700 text-lg font-bold`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button disabled={isVerifying} className="w-full py-5 bg-primary-600 hover:bg-primary-500 rounded-2xl font-black text-white shadow-2xl shadow-primary-600/30 transition-all uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3">
              {isVerifying ? <Loader2 className="animate-spin" size={20} /> : 'Unlock Engine'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#030712] text-gray-100 overflow-hidden font-sans selection:bg-primary-500/30">
      {!isMobile && (
        <aside className="w-72 border-r border-white/5 bg-[#030712] flex flex-col z-20">
          <div className="p-8">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/20">
                  <Zap size={22} className="text-white fill-current" />
               </div>
               <div>
                  <h1 className="text-2xl font-black tracking-tighter text-white">Flora</h1>
                  <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.2em] -mt-1">Auto-Engine v3.0</p>
               </div>
            </div>
          </div>
          
          <nav className="flex-1 px-4 space-y-1.5 mt-4">
            <NavItem icon={<LayoutDashboard size={18} />} label="Overview" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
            <NavItem icon={<Zap size={18} />} label="RAM Cache" active={activeTab === 'cache'} onClick={() => setActiveTab('cache')} />
            <NavItem icon={<Cloud size={18} />} label="Cloud Pool" active={activeTab === 'cloud'} onClick={() => setActiveTab('cloud')} />
            <NavItem icon={<ImageIcon size={18} />} label="Discovery" active={activeTab === 'media'} onClick={() => setActiveTab('media')} />
            <NavItem icon={<BarChart3 size={18} />} label="Analytics" active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} />
            <NavItem icon={<Terminal size={18} />} label="Engine Logs" active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
            <NavItem icon={<Settings size={18} />} label="Integrations" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          </nav>

          <div className="p-6 m-4 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
              <p className="text-[10px] font-black text-green-500 uppercase tracking-widest">Active Engine</p>
            </div>
            <div className="space-y-1">
               <p className="text-[10px] text-gray-500 font-medium">Next Cycle In</p>
               <p className="text-lg font-mono font-bold text-white tabular-nums">{nextPostTime || '00:00'}</p>
            </div>
            <button onClick={() => { localStorage.removeItem('flora_pass'); window.location.reload(); }} className="mt-6 w-full py-2 border border-white/5 hover:bg-white/5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-gray-500 transition-colors">
              Logout
            </button>
          </div>
        </aside>
      )}

      <main className="flex-1 flex flex-col overflow-hidden pb-[75px] lg:pb-0">
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-6 lg:px-10 bg-[#030712]/80 backdrop-blur-xl z-10 shrink-0">
          <div className="flex items-center gap-4 bg-white/5 border border-white/5 rounded-2xl px-5 py-2.5 flex-1 max-w-2xl">
            <Search size={18} className="text-gray-500" />
            <input 
              type="text" 
              placeholder="Discover the wild..." 
              className="bg-transparent border-none focus:outline-none text-sm w-full placeholder:text-gray-600"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchMedia()}
            />
          </div>
          <div className="flex items-center gap-6 ml-6">
            <button onClick={fetchStats} className="p-2.5 bg-white/5 rounded-xl hover:bg-white/10 transition-colors border border-white/5">
               <RefreshCw size={18} className="text-primary-400" />
            </button>
            <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center font-bold">F</div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 custom-scrollbar">
          {activeTab === 'dashboard' && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard icon={<Users className="text-blue-400" />} label="Network Reach" value={stats.totalReach.toLocaleString()} color="blue" />
                <StatCard icon={<Eye className="text-purple-400" />} label="Viral Views" value={stats.totalViews.toLocaleString()} color="purple" />
                <StatCard icon={<Heart className="text-red-400" />} label="Total Hearts" value={(stats as any).totalLikes?.toLocaleString() || '0'} color="red" />
              </div>

              <div>
                <h3 className="text-xl font-bold mb-8 flex items-center gap-3">
                  <div className="w-1 h-6 bg-primary-500 rounded-full"></div>
                  Performance Pulse
                </h3>
                
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {stats.recentPosts.map((post) => (
                    <div key={post._id} className="glass-card p-4 flex gap-5 group hover:bg-white/[0.03] transition-all duration-500">
                      <div className="w-24 h-32 lg:w-28 lg:h-36 rounded-2xl overflow-hidden flex-shrink-0 shadow-2xl relative bg-black">
                        {post.mediaUrl.includes('.mp4') || (post.insights?.media_url && post.insights.media_url.includes('video')) ? (
                          <video 
                            src={post.insights?.media_url || post.mediaUrl} 
                            className="w-full h-full object-cover" 
                            controls 
                            preload="metadata" 
                            crossOrigin="anonymous" 
                          />
                        ) : (
                          <img src={post.insights?.media_url || post.mediaUrl} className="w-full h-full object-cover" loading="lazy" />
                        )}
                      </div>

                      <div className="flex-1 flex flex-col justify-between py-1 overflow-hidden">
                        <div>
                          <div className="flex justify-between items-start">
                             <p className="text-[9px] text-gray-500 font-bold uppercase">{new Date(post.postedAt).toLocaleDateString()}</p>
                             <div className="flex gap-2">
                                <InsightBadge icon={<Heart size={10} />} label={post.insights?.likes || 0} color="red" />
                                <InsightBadge icon={<MessageCircle size={10} />} label={post.insights?.comments || 0} color="blue" />
                             </div>
                          </div>
                          <p className="text-sm font-semibold line-clamp-2 mt-3 text-gray-200">{post.description}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-4">
                          <InsightBadge icon={<Users size={12} />} label={post.insights?.reach || 0} color="blue" />
                          <InsightBadge icon={<Eye size={12} />} label={post.insights?.video_views || 0} color="purple" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'cache' && (
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-3xl font-black text-white">RAM & Local Cache</h2>
                <label className="cursor-pointer bg-primary-600 hover:bg-primary-500 px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-primary-600/20">
                  <Send size={16} className="-rotate-45" />
                  Upload to RAM
                  <input type="file" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const formData = new FormData();
                    formData.append('file', file);
                    setLoading(true);
                    try {
                      await axios.post('/api/media/upload', formData);
                      fetchLocalPool();
                    } catch (err) {
                      alert('Upload failed. Check if server supports RAM cache.');
                    } finally {
                      setLoading(false);
                    }
                  }} />
                </label>
              </div>
              {localPool.length === 0 ? (
                 <div className="p-20 text-center glass-card">
                    <Zap size={48} className="mx-auto mb-4 text-primary-500/20" />
                    <p className="text-gray-500">No media in local cache. Upload or wait for auto-pilot.</p>
                 </div>
              ) : (
                <div className="media-grid">
                  {localPool.map((item) => (
                    <div key={item.id} onClick={() => setSelectedMedia(item)} className="group relative aspect-[4/5] rounded-3xl overflow-hidden border border-white/5 hover:border-primary-500/50 transition-all cursor-pointer bg-black">
                      {item.resource_type === 'video' ? (
                        <video src={item.url} className="w-full h-full object-cover" muted onMouseOver={e => e.currentTarget.play()} onMouseOut={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }} crossOrigin="anonymous" />
                      ) : (
                        <img src={item.url} className="w-full h-full object-cover" loading="lazy" crossOrigin="anonymous" />
                      )}
                      <div className={`absolute top-4 left-4 px-2 py-1 rounded text-[8px] font-bold text-white uppercase ${item.source === 'ram' ? 'bg-primary-600' : 'bg-gray-600'}`}>{item.source}</div>
                      <div className="absolute top-4 right-4 bg-black/60 px-2 py-1 rounded text-[8px] font-bold text-white uppercase">{item.resource_type}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'cloud' && (
            <div className="space-y-8">
              <h2 className="text-3xl font-black text-white">Cloud Pool</h2>
              {cloudPool.length === 0 ? (
                 <div className="p-20 text-center glass-card">
                    <Cloud size={48} className="mx-auto mb-4 text-gray-700" />
                    <p className="text-gray-500">Cloudinary account is empty. Auto-sourcing active.</p>
                 </div>
              ) : (
                <div className="media-grid">
                  {cloudPool.map((item) => (
                    <div key={item.id} onClick={() => setSelectedMedia(item)} className="group relative aspect-[4/5] rounded-3xl overflow-hidden border border-white/5 hover:border-primary-500/50 transition-all cursor-pointer bg-black">
                      {item.resource_type === 'video' || item.url.includes('.mp4') ? (
                        <video src={item.url} className="w-full h-full object-cover" muted onMouseOver={e => e.currentTarget.play()} onMouseOut={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }} crossOrigin="anonymous" />
                      ) : (
                        <img src={item.url} className="w-full h-full object-cover" loading="lazy" crossOrigin="anonymous" />
                      )}
                      <div className="absolute top-4 right-4 bg-black/60 px-2 py-1 rounded text-[8px] font-bold text-white uppercase">{item.resource_type || (item.url.includes('.mp4') ? 'video' : 'image')}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'media' && (
            <div className="space-y-8">
              <h2 className="text-3xl font-black text-white">Discovery Hub</h2>
              <div className="media-grid">
                {images.map((img) => (
                  <div key={img.id} onClick={() => setSelectedMedia(img)} className="group aspect-[4/5] rounded-3xl overflow-hidden border border-white/5 hover:border-primary-500 transition-all cursor-pointer">
                    <img src={img.previewUrl} className="w-full h-full object-cover" loading="lazy" crossOrigin="anonymous" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-8">
              <h2 className="text-3xl font-black text-white">Analytics</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard icon={<BarChart3 className="text-primary-400" />} label="Total Posts" value={stats.totalPosts.toLocaleString()} color="blue" />
                <StatCard icon={<Eye className="text-purple-400" />} label="Total Reach" value={stats.totalReach.toLocaleString()} color="purple" />
                <StatCard icon={<Heart className="text-red-400" />} label="Total Views" value={stats.totalViews.toLocaleString()} color="red" />
              </div>

              {/* 7-Day Posts Chart */}
              <div className="p-8 rounded-[2rem] border border-white/5 bg-white/[0.01]">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-3">
                  <div className="w-1 h-5 bg-primary-500 rounded-full"></div>
                  Posts Per Day (Last 7 Days)
                </h3>
                <BarChart data={history} valueKey="posts" color="#3b82f6" />
              </div>

              {/* 7-Day Reach Chart */}
              <div className="p-8 rounded-[2rem] border border-white/5 bg-white/[0.01]">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-3">
                  <div className="w-1 h-5 bg-purple-500 rounded-full"></div>
                  Reach Per Day (Last 7 Days)
                </h3>
                <BarChart data={history} valueKey="reach" color="#a855f7" />
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="p-6 bg-black/40 rounded-[2rem] border border-white/5 font-mono text-xs overflow-y-auto h-[60vh] space-y-2 custom-scrollbar">
               {logs.map(log => (
                  <div key={log._id} className="flex gap-4 p-2 hover:bg-white/5 rounded-lg">
                     <span className="text-gray-600 font-bold">[{new Date(log.createdAt).toLocaleTimeString()}]</span>
                     <span className={log.level === 'error' ? 'text-red-400' : 'text-primary-400'}>{log.message}</span>
                  </div>
               ))}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-10">
              <div>
                <h2 className="text-3xl font-black text-white flex items-center gap-3">
                  <Settings className="text-primary-500 animate-spin-slow" size={32} />
                  Engine Integrations & API Keys
                </h2>
                <p className="text-gray-500 mt-2 text-sm max-w-2xl">
                  Dynamically configure your social platforms, media source keys, and notification channels. Database settings securely override environment variables.
                </p>
              </div>

              {settingsLoading ? (
                <div className="flex flex-col items-center justify-center p-20 glass-card">
                  <Loader2 className="animate-spin text-primary-500 mb-4" size={48} />
                  <p className="text-gray-500 text-sm font-bold uppercase tracking-wider">Syncing Configurations...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                  {/* Settings Form */}
                  <div className="space-y-8">
                    <form onSubmit={handleSaveSettings} className="space-y-6">
                      
                      {/* Meta API Settings */}
                      <div className="glass-card p-8 rounded-[2rem] border border-white/5 space-y-6">
                        <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                          <div className="p-2 bg-blue-500/10 rounded-xl text-blue-400">
                            <Users size={20} />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-white">Meta API Connection</h3>
                            <p className="text-xs text-gray-500">Instagram Professional & Facebook Page integration</p>
                          </div>
                        </div>
                        
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Meta Access Token</label>
                            <input 
                              type="password" 
                              placeholder="EAAC..."
                              className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-sm focus:border-primary-500 outline-none text-gray-200 transition-colors"
                              value={settings.metaAccessToken}
                              onChange={(e) => setSettings({ ...settings, metaAccessToken: e.target.value })}
                            />
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Instagram Account ID</label>
                              <input 
                                type="text" 
                                placeholder="e.g. 178414247..."
                                className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-sm focus:border-primary-500 outline-none text-gray-200 transition-colors"
                                value={settings.instagramAccountId}
                                onChange={(e) => setSettings({ ...settings, instagramAccountId: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Facebook Page ID</label>
                              <input 
                                type="text" 
                                placeholder="e.g. 110220913..."
                                className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-sm focus:border-primary-500 outline-none text-gray-200 transition-colors"
                                value={settings.facebookPageId}
                                onChange={(e) => setSettings({ ...settings, facebookPageId: e.target.value })}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Telegram Notifications */}
                      <div className="glass-card p-8 rounded-[2rem] border border-white/5 space-y-6">
                        <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                          <div className="p-2 bg-primary-500/10 rounded-xl text-primary-400">
                            <Bell size={20} />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-white">Telegram Alerts</h3>
                            <p className="text-xs text-gray-500">Live notifications for Autopilot runs</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Bot Token</label>
                            <input 
                              type="password" 
                              placeholder="e.g. 123456:ABC-DEF..."
                              className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-sm focus:border-primary-500 outline-none text-gray-200 transition-colors"
                              value={settings.telegramBotToken}
                              onChange={(e) => setSettings({ ...settings, telegramBotToken: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Chat ID</label>
                            <input 
                              type="text" 
                              placeholder="e.g. -1001234567..."
                              className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-sm focus:border-primary-500 outline-none text-gray-200 transition-colors"
                              value={settings.telegramChatId}
                              onChange={(e) => setSettings({ ...settings, telegramChatId: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Media Discovery keys */}
                      <div className="glass-card p-8 rounded-[2rem] border border-white/5 space-y-6">
                        <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                          <div className="p-2 bg-purple-500/10 rounded-xl text-purple-400">
                            <ImageIcon size={20} />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-white">Media API Keys</h3>
                            <p className="text-xs text-gray-500">External stock video/photo endpoints</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Pexels API Key</label>
                            <input 
                              type="password" 
                              placeholder="Enter Pexels Key"
                              className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-sm focus:border-primary-500 outline-none text-gray-200 transition-colors"
                              value={settings.pexelsApiKey}
                              onChange={(e) => setSettings({ ...settings, pexelsApiKey: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Pixabay API Key</label>
                            <input 
                              type="password" 
                              placeholder="Enter Pixabay Key"
                              className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-sm focus:border-primary-500 outline-none text-gray-200 transition-colors"
                              value={settings.pixabayApiKey}
                              onChange={(e) => setSettings({ ...settings, pixabayApiKey: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>

                      {/* System & Audio Playlist */}
                      <div className="glass-card p-8 rounded-[2rem] border border-white/5 space-y-6">
                        <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                          <div className="p-2 bg-green-500/10 rounded-xl text-green-400">
                            <Music size={20} />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-white">Autopilot & Media Parameters</h3>
                            <p className="text-xs text-gray-500">Caption generation and background soundtrack pools</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Hugging Face Token (AI Caption)</label>
                            <input 
                              type="password" 
                              placeholder="hf_..."
                              className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-sm focus:border-primary-500 outline-none text-gray-200 transition-colors"
                              value={settings.hfToken}
                              onChange={(e) => setSettings({ ...settings, hfToken: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Song Link Pool (Comma Separated URLs)</label>
                            <textarea 
                              placeholder="https://example.com/song1.mp3, https://example.com/song2.mp3..."
                              className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-sm focus:border-primary-500 outline-none text-gray-200 transition-colors h-28 resize-y"
                              value={settings.songLinks}
                              onChange={(e) => setSettings({ ...settings, songLinks: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Submit Button */}
                      <div className="flex items-center gap-4">
                        <button 
                          type="submit" 
                          disabled={settingsSaving}
                          className="flex-grow py-5 bg-primary-600 hover:bg-primary-500 rounded-2xl font-black text-white shadow-2xl shadow-primary-600/30 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                          {settingsSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                          {settingsSaving ? 'Saving Configurations...' : 'Save Configurations'}
                        </button>
                        {settingsSuccess && (
                          <span className="text-green-500 text-xs font-black uppercase tracking-wider animate-pulse">Saved Successfully!</span>
                        )}
                        {settingsError && (
                          <span className="text-red-500 text-xs font-black uppercase tracking-wider">{settingsError}</span>
                        )}
                      </div>
                    </form>
                  </div>

                  {/* Right Side: Diagnostics & Instructions */}
                  <div className="space-y-8">
                    
                    {/* Meta Integration Audit Diagnostic */}
                    <div className="glass-card p-8 rounded-[2rem] border border-white/5 space-y-6">
                      <div className="flex justify-between items-center border-b border-white/5 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400">
                            <Terminal size={20} />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-white">Integration Diagnostics</h3>
                            <p className="text-xs text-gray-500">Run live Graph API & scope permission test</p>
                          </div>
                        </div>
                        <button 
                          onClick={runMetaDiagnostics} 
                          disabled={testingMeta}
                          className="px-4 py-2.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                          {testingMeta ? <Loader2 className="animate-spin" size={12} /> : <RefreshCw size={12} />}
                          {testingMeta ? 'Auditing...' : 'Run Audit'}
                        </button>
                      </div>

                      {/* Diagnostic Console Box */}
                      <div className="p-5 bg-black/40 border border-white/5 rounded-2xl font-mono text-[11px] leading-relaxed overflow-y-auto h-72 space-y-1.5 custom-scrollbar text-gray-300">
                        {diagnosticLogs.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-gray-600">
                            <Terminal size={32} className="mb-2 text-gray-700 animate-pulse" />
                            <p className="text-center font-bold">Console is ready.</p>
                            <p className="text-[10px] text-gray-700 mt-1">Click "Run Audit" to test token & linkages.</p>
                          </div>
                        ) : (
                          diagnosticLogs.map((log, index) => {
                            let colorClass = 'text-gray-400';
                            if (log.includes('✅')) colorClass = 'text-green-400 font-bold';
                            else if (log.includes('❌')) colorClass = 'text-red-400 font-bold';
                            else if (log.includes('⚠️')) colorClass = 'text-yellow-400 font-bold';
                            else if (log.includes('🚀') || log.includes('🔍')) colorClass = 'text-indigo-400 font-bold';
                            return (
                              <div key={index} className={`whitespace-pre-wrap ${colorClass}`}>
                                {log}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Instruction Guide / Help Guide Card */}
                    <div className="glass-card p-8 rounded-[2rem] border border-white/5 space-y-6 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/5 rounded-full blur-2xl"></div>
                      
                      <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <div className="p-2 bg-yellow-500/10 rounded-xl text-yellow-400">
                          <Zap size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-white">Setup Guidelines</h3>
                          <p className="text-xs text-gray-500">Meta Access Token & Scope configuration</p>
                        </div>
                      </div>

                      <div className="space-y-4 text-xs text-gray-400 leading-relaxed">
                        <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                          <p className="font-bold text-white mb-2 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
                            1. Generate a Long-Lived Token (60 Days)
                          </p>
                          <p className="pl-3 mb-2">
                            Do not use a default Graph API Explorer token directly (they expire in 2 hours!). Exchange it for a long-lived page token:
                          </p>
                          <ol className="list-decimal pl-7 space-y-1">
                            <li>Visit <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" className="text-primary-400 underline">Meta Graph Explorer</a>.</li>
                            <li>Select your App, and choose Scopes: <code>pages_show_list, instagram_basic, instagram_content_publish, pages_read_engagement, pages_manage_posts</code>.</li>
                            <li>Generate the token, then use Meta's Access Token Tool to exchange it for a **60-day Long-Lived Access Token**.</li>
                          </ol>
                        </div>

                        <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                          <p className="font-bold text-white mb-2 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
                            2. Resolve "No permission to publish video"
                          </p>
                          <p className="pl-3">
                            If you get <code>(#100) No permission to publish the video</code>, this means either:
                          </p>
                          <ul className="list-disc pl-7 space-y-1 mt-1">
                            <li>Your Meta App is in <b>Development Mode</b> and the page/instagram account is not owned by the Developer/Admin of the app.</li>
                            <li>Your access token lacks the <b>pages_manage_posts</b> or <b>publish_video</b> permission.</li>
                            <li>The connected Facebook Page does not have sufficient business permissions. Ensure you linked your page to your professional Instagram profile.</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 h-[75px] bg-[#030712]/90 backdrop-blur-2xl border-t border-white/5 flex justify-around items-center px-4 z-[100]">
          <MobileNavItem icon={<LayoutDashboard size={22} />} active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <MobileNavItem icon={<Zap size={22} />} active={activeTab === 'cache'} onClick={() => setActiveTab('cache')} />
          <MobileNavItem icon={<Cloud size={22} />} active={activeTab === 'cloud'} onClick={() => setActiveTab('cloud')} />
          <MobileNavItem icon={<ImageIcon size={22} />} active={activeTab === 'media'} onClick={() => setActiveTab('media')} />
          <MobileNavItem icon={<Terminal size={22} />} active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
          <MobileNavItem icon={<Settings size={22} />} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      )}

      <AnimatePresence>
        {selectedMedia && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#030712]/95 backdrop-blur-2xl">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-[#030712] border border-white/10 rounded-[2.5rem] w-full max-w-5xl h-[90vh] lg:h-[80vh] overflow-hidden flex flex-col lg:flex-row">
              <div className="flex-1 bg-black flex items-center justify-center relative">
                {selectedMedia.resource_type === 'video' || selectedMedia.url.includes('.mp4') ? (
                   <video src={selectedMedia.url} className="max-h-full max-w-full" controls autoPlay crossOrigin="anonymous" />
                ) : (
                   <img src={selectedMedia.url} className="max-h-full max-w-full" />
                )}
                <button onClick={() => { setSelectedMedia(null); setVerifyPass(false); }} className="absolute top-6 left-6 p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all border border-white/10">
                  <X size={24} />
                </button>
              </div>

              <div className="w-full lg:w-[380px] p-8 lg:p-10 flex flex-col bg-[#030712] border-t lg:border-t-0 lg:border-l border-white/5 overflow-y-auto">
                <h3 className="text-2xl font-black italic mb-8">Manual Publish</h3>
                <textarea 
                  className="w-full h-full min-h-[200px] bg-white/[0.02] border border-white/5 rounded-3xl p-5 text-sm focus:border-primary-500 outline-none mb-6 text-gray-200"
                  placeholder="Enter caption..."
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
                <div className="mb-6 p-5 bg-primary-500/5 border border-primary-500/10 rounded-3xl">
                   <p className="text-[10px] font-black text-primary-400 uppercase mb-3">Confirm Secret</p>
                   <input type="password" placeholder="Admin Password" className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-sm focus:border-primary-500 outline-none" onChange={e => setVerifyPass(e.target.value === localStorage.getItem('flora_pass'))} />
                </div>
                <button disabled={posting || !verifyPass} onClick={handleQuickPublish} className={`w-full py-5 rounded-3xl font-black uppercase text-sm tracking-widest transition-all ${!verifyPass ? 'bg-gray-800 text-gray-500' : 'bg-primary-600 hover:bg-primary-500 text-white shadow-xl shadow-primary-600/20'}`}>
                  {posting ? <Loader2 className="animate-spin" size={20} /> : verifyPass ? 'Publish Now' : 'Locked'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSuccess && (
          <motion.div initial={{ opacity: 0, y: 100, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 100, x: '-50%' }} className="fixed bottom-12 left-1/2 bg-white text-gray-950 px-8 py-4 rounded-full shadow-2xl flex items-center gap-4 z-[300]">
            <CheckCircle2 size={18} className="text-green-500" />
            <p className="font-black text-sm uppercase">Success!</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${active ? 'bg-white/5 text-white shadow-xl border border-white/5' : 'text-gray-500 hover:text-white hover:bg-white/[0.02]'}`}>
      <div className={active ? 'text-primary-500' : 'text-gray-500'}>{icon}</div>
      <span className={`font-bold text-sm ${active ? 'text-white' : 'text-gray-500'}`}>{label}</span>
    </button>
  );
}

function MobileNavItem({ icon, active, onClick }: { icon: any, active: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className={`p-4 rounded-2xl transition-all ${active ? 'text-primary-500 bg-primary-500/10' : 'text-gray-500'}`}>
      {icon}
    </button>
  );
}

// ─── CSS Bar Chart Component ───────────────────────────────────────────────
function BarChart({ data, valueKey, color }: { data: HistoryDay[], valueKey: 'posts' | 'reach', color: string }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div className="flex items-end gap-3 h-48">
      {data.map((day, i) => {
        const pct = (day[valueKey] / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <span className="text-[10px] font-bold text-gray-400">{day[valueKey] > 0 ? day[valueKey].toLocaleString() : ''}</span>
            <div
              className="w-full rounded-t-xl transition-all duration-700"
              style={{ height: `${Math.max(pct, 3)}%`, backgroundColor: color, opacity: 0.7 + (i / data.length) * 0.3 }}
            />
            <span className="text-[9px] text-gray-600 font-semibold text-center leading-tight">{day.date.split(' ').slice(0,2).join(' ')}</span>
          </div>
        );
      })}
      {data.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">No data yet</div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: any, label: string, value: string, color: string }) {
  const colors: any = { blue: 'text-blue-400', purple: 'text-purple-400', red: 'text-red-400' };
  return (
    <div className={`p-8 rounded-[2rem] border border-white/5 bg-white/[0.01] flex flex-col gap-2 relative overflow-hidden`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2.5 rounded-xl bg-white/5 ${colors[color]}`}>{icon}</div>
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
      </div>
      <span className="text-4xl font-black tracking-tighter text-white">{value}</span>
    </div>
  );
}

function InsightBadge({ icon, label, color }: { icon: any, label: string | number, color: string }) {
  const colors: any = { blue: 'text-blue-400 bg-blue-400/10 border-blue-500/10', purple: 'text-purple-400 bg-purple-400/10 border-purple-500/10', red: 'text-red-400 bg-red-400/10 border-red-500/10' };
  return (
    <div className={`flex items-center gap-1.5 text-[9px] px-2 py-1 rounded-lg border font-bold ${colors[color]}`}>
      {icon} {label}
    </div>
  );
}

export default App;
