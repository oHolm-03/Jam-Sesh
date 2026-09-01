import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import InlineRename from './InlineRename';

type Project = {
    id: string;
    name: string;
    created_at: string;
    created_by: string;
}

const Projects = ({ onSelectProject }: { onSelectProject: (id: string) => void }) => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [newProjectName, setNewProjectName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [inviteUsername, setInviteUsername] = useState<Record<string, string>>({});
    const [inviteStatus, setInviteStatus] = useState<Record<string, string>>({});
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);

    const fetchProjects = async () => {
        //only returning rows where user is actually a project member
        const { data, error } = await supabase
            .from('projects')
            .select('id, name, created_at, created_by')
            .order('created_at', { ascending: false });

        if (error) {
            setErrorMsg(error.message);
        } else if (data) {
            setProjects(data);
        }
    };

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    }, []);

    useEffect(() => {
        fetchProjects();
    }, []);

    const createProject = async () => {
        if (!newProjectName.trim()) return;

        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        console.log('Current user ID:', userId); // temporary debug line

        if (!userId) return;

        const { data: project, error: projectError } = await supabase
            .from('projects')
            .insert({ name: newProjectName, created_by: userId })
            .select()
            .single();

        if (projectError || !project) {
            setErrorMsg(projectError?.message ?? 'Failed to create project');
            return;
        }

        // add yourself as a member, so later you and invited bandmates see it
        const { error: memberError } = await supabase
            .from('project_members')
            .insert({ project_id: project.id, user_id: userId });

        if (memberError) {
            setErrorMsg(memberError.message);
            return;
        }

        setNewProjectName('');
        fetchProjects();
    };

    const inviteToProject = async (projectId: string) => {
        const username = inviteUsername[projectId]?.trim();
        if (!username) return;

        //Lookup invitee's user ID by username
        const { data: profile, error: lookupError } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', username)
            .single();

        if (lookupError || !profile) {
            setInviteStatus((prev) => ({ ...prev, [projectId]: 'No user found with that username' }));
            return;
        }

        const { error: insertError } = await supabase
            .from('project_members')
            .insert({ project_id: projectId, user_id: profile.id });

        if (insertError) {
            setInviteStatus((prev) => ({ ...prev, [projectId]: insertError.message }));
        } else {
            setInviteStatus((prev) => ({ ...prev, [projectId]: 'Added!' }));
            setInviteUsername((prev) => ({ ...prev, [projectId]: '' }));
        }
    }

    const deleteProject = async (projectId: string, projectName: string) => {
        const confirmed = window.confirm(`Delete "${projectName}"? This will permanently remove it and all its recordings for everyone.`);
        if (!confirmed) return;

        const { error } = await supabase.from('projects').delete().eq('id', projectId);

        if (error) {
            setErrorMsg(error.message);
        } else {
            setOpenMenuProjectId(null);
            fetchProjects();
        }
    };

    return (
        <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
            <h2>Your Projects</h2>

            <div style={{ marginBottom: 20 }}>
                <input
                    type="text"
                    placeholder="New project name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                />
                <button onClick={createProject}>Create Project</button>
            </div>

            {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}

            {openMenuProjectId && (
                <div
                    onClick={() => setOpenMenuProjectId(null)}
                    style={{position: 'fixed', inset: 0, zIndex: 5}}
                />
            )}

            <ol>
                {projects.map((project) => (
                    <li key={project.id} style={{ marginBottom: 15, position: 'relative' }}>
                        <button onClick={() => onSelectProject(project.id)}>{project.name}</button>
                        <button 
                            onClick={() => setOpenMenuProjectId(openMenuProjectId === project.id ? null : project.id)}
                            aria-label="Project settings"
                            style={{marginLeft: 8}}
                            >⋮</button>

                        {openMenuProjectId === project.id && (
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            marginTop: 4,
                            background: '#fff',
                            border: '1px solid #ccc',
                            borderRadius: 6,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                            padding: 12,
                            minWidth: 240,
                            zIndex: 10,
                        }}
                    >
                        <div style={{ marginBottom: 12 }}>
                            <InlineRename
                                value={project.name}
                                label="Rename project"
                                onSave={async (newName) => {
                                    const { error } = await supabase.from('projects').update({ name: newName }).eq('id', project.id);
                                    if (error) {
                                        setErrorMsg(error.message);
                                        return;
                                    }
                                    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, name: newName } : p)));
                                }}
                            />
                        </div>
 
                        <div style={{ marginBottom: 12 }}>
                            <input
                                type="text"
                                placeholder="Username"
                                value={inviteUsername[project.id] || ''}
                                onChange={(e) =>
                                    setInviteUsername((prev) => ({ ...prev, [project.id]: e.target.value }))
                                }
                            />
                            <button onClick={() => inviteToProject(project.id)}>Invite</button>
                            {inviteStatus[project.id] && (
                                <div style={{ fontSize: 12, marginTop: 4 }}>{inviteStatus[project.id]}</div>
                            )}
                        </div>
 
                        {project.created_by === currentUserId && (
                            <button onClick={() => deleteProject(project.id, project.name)}>Delete Project</button>
                        )}
                        </div>
                    )}
                    </li>
                ))}
            </ol>
        </div>
    );
};

export default Projects;