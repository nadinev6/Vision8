import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useUsageTracking } from '../lib/useUsageTracking';
import {
    UserIcon,
    BarChartIcon,
    VideoIcon,
    VideoAIIcon,
    SettingsIcon,
    MoonIcon,
    SunIcon,
    ArrowLeftIcon
} from './icons';
import { CoinexSmartChain } from './svg.tsx';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { Toaster, toast } from 'sonner';

interface UserProfilePageProps {
    onBack: () => void;
}

const UserProfilePage: React.FC<UserProfilePageProps> = ({ onBack }) => {
    const { user, userProfile, logout } = useAuth();
    const { theme, setTheme } = useTheme();
    const { usage, isLoading: isUsageLoading } = useUsageTracking();

    // Local preferences state (mocked for now, typically would go to DB)
    const [defaultModel] = useState<'wan2.2'>('wan2.2');
    const [emailNotifications, setEmailNotifications] = useState(true);

    // Load preferences from local storage
    useEffect(() => {
        const savedNotifications = localStorage.getItem('pref_email_notifications');
        if (savedNotifications) setEmailNotifications(savedNotifications === 'true');
    }, []);

    const handleModelChange = (_model: 'wan2.2') => {
        // No-op, Wan 2.2 is the only supported model
        toast.info('Wan 2.2 is the only available model at this time.');
    };

    const handleNotificationChange = () => {
        const newValue = !emailNotifications;
        setEmailNotifications(newValue);
        localStorage.setItem('pref_email_notifications', String(newValue));
        toast.info(`Email notifications ${newValue ? 'enabled' : 'disabled'}`);
    };

    // Calculate 'Credits' based on usage (Mock calculation)
    // Assuming 500 starting credits, -10 per upload, -50 per generation, -20 per analysis
    const calculateCredits = () => {
        if (!usage) return 500;
        const used = (usage.videos_uploaded * 10) + (usage.ai_generations * 50) + (usage.scenes_analyzed * 1);
        return Math.max(0, 500 - used);
    };

    const credits = calculateCredits();
    const creditPercentage = (credits / 500) * 100;

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            {/* Header */}
            <header className="border-b border-border p-4 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="max-w-5xl mx-auto flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeftIcon className="w-5 h-5" />
                    </Button>
                    <h1 className="text-xl font-semibold">User Profile & Settings</h1>
                </div>
            </header>

            <main className="flex-1 p-6 w-full">
                <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">

                {/* User Identity Section */}
                <div className="flex items-center gap-6 p-6 bg-card rounded-xl border border-border shadow-sm">
                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-3xl font-bold border-2 border-primary/20">
                        {userProfile?.name?.charAt(0).toUpperCase() || <UserIcon className="w-10 h-10" />}
                    </div>
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold">{userProfile?.name || 'Vision8 User'}</h2>
                        <p className="text-muted-foreground">{user?.email}</p>
                        <div className="flex gap-2 mt-2">
                            <div className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                                Pro Plan
                            </div>
                            <div className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium border border-border">
                                Member since {new Date().getFullYear()}
                            </div>
                        </div>
                    </div>
                    <Button variant="outline" onClick={logout} className="ml-auto text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20">
                        Sign Out
                    </Button>
                </div>

                {/* Usage Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Credits Card */}
                    <div className="p-5 bg-card rounded-xl border border-border shadow-sm flex flex-col gap-2 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <CoinexSmartChain className="w-24 h-24 text-primary translate-x-4 -translate-y-4" />
                        </div>
                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <CoinexSmartChain className="w-4 h-4 text-primary" /> Available Credits
                        </h3>
                        <div className="text-3xl font-bold mt-2">{credits} <span className="text-sm font-normal text-muted-foreground">/ 500</span></div>
                        <div className="w-full bg-secondary h-2 rounded-full mt-2 overflow-hidden">
                            <div
                                className={cn("h-full rounded-full transition-all duration-1000", creditPercentage > 20 ? "bg-primary" : "bg-red-500")}
                                style={{ width: `${creditPercentage}%` }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Refreshes monthly</p>
                    </div>

                    {/* Videos Uploaded */}
                    <div className="p-5 bg-card rounded-xl border border-border shadow-sm flex flex-col gap-2">
                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <VideoIcon className="w-4 h-4" /> Videos Uploaded
                        </h3>
                        <div className="text-3xl font-bold mt-2">{usage?.videos_uploaded || 0}</div>
                        <p className="text-xs text-muted-foreground mt-auto">Lifetime uploads</p>
                    </div>

                    {/* AI Generations */}
                    <div className="p-5 bg-card rounded-xl border border-border shadow-sm flex flex-col gap-2">
                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <VideoAIIcon className="w-4 h-4" /> AI Generations
                        </h3>
                        <div className="text-3xl font-bold mt-2">{usage?.ai_generations || 0}</div>
                        <p className="text-xs text-muted-foreground mt-auto">Videos generated</p>
                    </div>

                    {/* Scenes Analyzed */}
                    <div className="p-5 bg-card rounded-xl border border-border shadow-sm flex flex-col gap-2">
                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <BarChartIcon className="w-4 h-4" /> Scenes Analyzed
                        </h3>
                        <div className="text-3xl font-bold mt-2">{usage?.scenes_analyzed || 0}</div>
                        <p className="text-xs text-muted-foreground mt-auto">Total scenes processed</p>
                    </div>
                </div>

                {/* Settings Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* Preferences */}
                    <div className="space-y-6">
                        <h2 className="text-lg font-semibold flex items-center gap-2 pb-2 border-b border-border">
                            <SettingsIcon className="w-5 h-5" /> Preferences
                        </h2>

                        <div className="space-y-6">
                            {/* Default Model */}
                            <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border/50">
                                <div>
                                    <h4 className="font-medium">Default Generation Model</h4>
                                    <p className="text-sm text-muted-foreground">Preferred model for new generations</p>
                                </div>
                                <div className="bg-secondary px-4 py-2 rounded-lg font-medium text-foreground">
                                    Wan 2.2
                                </div>
                            </div>

                            {/* Theme Toggle */}
                            <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border/50">
                                <div>
                                    <h4 className="font-medium">Appearance</h4>
                                    <p className="text-sm text-muted-foreground">Customize the interface theme</p>
                                </div>
                                <div className="flex bg-secondary p-1 rounded-lg">
                                    <button
                                        onClick={() => setTheme('light')}
                                        className={cn(
                                            "p-2 rounded-md transition-all flex items-center gap-2",
                                            theme === 'light' ? "bg-card shadow text-yellow-600" : "text-muted-foreground hover:text-foreground"
                                        )}
                                        title="Light Mode"
                                    >
                                        <SunIcon className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => setTheme('dark')}
                                        className={cn(
                                            "p-2 rounded-md transition-all flex items-center gap-2",
                                            theme === 'dark' ? "bg-card shadow text-indigo-400" : "text-muted-foreground hover:text-foreground"
                                        )}
                                        title="Dark Mode"
                                    >
                                        <MoonIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Notifications */}
                            <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border/50">
                                <div>
                                    <h4 className="font-medium">Email Notifications</h4>
                                    <p className="text-sm text-muted-foreground">Receive updates about your generations</p>
                                </div>
                                <button
                                    onClick={handleNotificationChange}
                                    className={cn(
                                        "w-12 h-6 rounded-full relative transition-colors duration-200 ease-in-out",
                                        emailNotifications ? "bg-primary" : "bg-muted"
                                    )}
                                >
                                    <div className={cn(
                                        "w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform duration-200 ease-in-out",
                                        emailNotifications ? "translate-x-6.5 left-[1px]" : "translate-x-0.5"
                                    )} style={{ left: emailNotifications ? 'calc(100% - 1.35rem)' : '2px' }} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Documentation / Info */}
                    <div className="space-y-6">
                        <h2 className="text-lg font-semibold flex items-center gap-2 pb-2 border-b border-border">
                            <span className="text-muted-foreground/50">#</span> Documentation
                        </h2>
                        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                            <h3 className="font-medium">Keyboard Shortcuts</h3>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Play / Pause</span>
                                    <kbd className="px-2 py-0.5 bg-muted rounded border border-border font-mono text-xs">Space</kbd>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Seek Forward</span>
                                    <kbd className="px-2 py-0.5 bg-muted rounded border border-border font-mono text-xs">Right</kbd>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Seek Backward</span>
                                    <kbd className="px-2 py-0.5 bg-muted rounded border border-border font-mono text-xs">Left</kbd>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Toggle Mute</span>
                                    <kbd className="px-2 py-0.5 bg-muted rounded border border-border font-mono text-xs">M</kbd>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Fullscreen</span>
                                    <kbd className="px-2 py-0.5 bg-muted rounded border border-border font-mono text-xs">F</kbd>
                                </div>
                            </div>
                        </div>

                        <div className="bg-primary/5 rounded-xl border border-primary/10 p-6">
                            <h3 className="font-medium text-primary mb-2">Need help?</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                Check out our documentation for advanced workflows and tips on getting the best results from Vision8.
                            </p>
                            <Button variant="outline" className="w-full border-primary/20 hover:bg-primary/10 text-primary">
                                View Documentation
                            </Button>
                        </div>
                    </div>
                </div>
                </div>
            </main>
        </div>
    );
};

export default UserProfilePage;
