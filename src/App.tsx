import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase, type Profile } from "./lib/supabase";
import { Navbar } from "./components/Navbar";
import { LoginPage } from "./pages/LoginPage";
import { ProjectsListPage } from "./pages/ProjectsListPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { TaskDetailPage } from "./pages/TaskDetailPage";
import { MyTasksPage } from "./pages/MyTasksPage";

export default function App() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [initializing, setInitializing] = useState(true);

    const loadUserProfile = async (userId: string) => {
        const { data } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .single();
        if (data) setProfile(data as Profile);
        setInitializing(false);
    };

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                loadUserProfile(session.user.id);
            } else {
                setInitializing(false);
            }
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                loadUserProfile(session.user.id);
            } else {
                setProfile(null);
                setInitializing(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setProfile(null);
    };

    if (initializing) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
                Загрузка...
            </div>
        );
    }

    if (!profile) {
        return <LoginPage />;
    }

    return (
        <BrowserRouter>
            <div className="min-h-screen bg-slate-50 text-slate-900">
                <Navbar profile={profile} onLogout={handleLogout} />
                <main className="max-w-5xl mx-auto px-4 py-8">
                    <Routes>
                        <Route
                            path="/projects"
                            element={<ProjectsListPage profile={profile} />}
                        />
                        <Route
                            path="/projects/:id"
                            element={<ProjectDetailPage profile={profile} />}
                        />
                        <Route
                            path="/tasks/:id"
                            element={<TaskDetailPage profile={profile} />}
                        />
                        <Route
                            path="/my-tasks"
                            element={<MyTasksPage profile={profile} />}
                        />
                        <Route
                            path="*"
                            element={<Navigate to="/projects" replace />}
                        />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}
