import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import InlineRename from './InlineRename';
import './Projects.css';

type Project = {
    id: string;
    name: string;
    created_at: string;
    created_by: string;
    description?: string;
    owner_id?: string;
    invited_users?: string[];
}

const Projects = ({ onSelectProject }: { onSelectProject: (id: string) => void }) => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [newProjectName, setNewProjectName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [inviteUsername, setInviteUsername] = useState<Record<string, string>>({});
    const [inviteStatus, setInviteStatus] = useState<Record<string, string>>({});
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

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
    };

    const handleMakeCopy = async (projectToCopy: Project) => {
        setLoading(true);
        setErrorMsg('');

        try{
            const {data: {user}} = await supabase.auth.getUser();
            if(!user){
                throw new Error('User not authenticated');
            }
            // create the new project
            const {data: newProject, error: createError} = await supabase
                .from('projects')
                .insert({name: `${projectToCopy.name} (Copy)`, created_by: user.id,})
                .select()
                .single();
            if(createError || !newProject) throw createError;

            // add current user as a member
            const{error: memberError} = await supabase
                .from('project_members')
                .insert({
                    project_id: newProject.id,
                    user_id: user.id,
                });
            if(memberError){
                throw memberError;
            }

            // copy over project notes
            const { data: docData } = await supabase
                .from('documents')
                .select('title, content')
                .eq('project_id', projectToCopy.id)
                .maybeSingle();

            if (docData) { await supabase
                .from('documents')
                .insert({
                    project_id: newProject.id,
                    title: docData.title,
                    content: docData.content,
                    updated_at: new Date().toISOString(),
                });
            }

            // get all tracks from original project
            const {data: originalTracks, error: tracksFetchError} = await supabase
                .from('tracks')
                .select('id, name, effects')
                .eq('project_id', projectToCopy.id);
            if(tracksFetchError){
                throw tracksFetchError;
            }
            // map: original trackId -> new trackId
            const trackIdMap = new Map<string, string>();

            //copy tracks
            if(originalTracks && originalTracks.length >0){
                for(const track of originalTracks){
                    const{data: newTrack, error: trackInsertError} = await supabase
                        .from('tracks')
                        .insert({
                            project_id: newProject.id,
                            name: track.name,
                            effects: track.effects,
                        })
                        .select('id')
                        .single();
                    if(trackInsertError){
                        throw trackInsertError;
                    }
                    if(!newTrack){
                        throw new Error(`Failed to copy track "${track.name}"`);
                    }
                    trackIdMap.set(track.id, newTrack.id);
                }
            }

            // get clips from original tracks
            const originalTrackIds = originalTracks?.map(track => track.id) ?? [];

            if(originalTrackIds.length >0){
                const{data: originalClips, error: clipsFetchError} = await supabase
                    .from('clips')
                    .select('track_id, uploaded_by, storage_path, file_size_bytes')
                    .in('track_id', originalTrackIds);
                if(clipsFetchError){
                    throw clipsFetchError;
                }

                // copy clips and point them to the new tracks
                if(originalClips && originalClips.length > 0){
                    const newClips = originalClips
                        .map(clip => {
                            const newTrackId = trackIdMap.get(clip.track_id);
                            if(!newTrackId){
                                return null;
                            }
                            return {
                                track_id: newTrackId,
                                uploaded_by: user.id,
                                storage_path: clip.storage_path,
                                file_size_bytes: clip.file_size_bytes,
                            };
                        })
                        .filter((clip): clip is NonNullable<typeof clip> => clip !== null);
                    if(newClips.length > 0){
                        const{error: clipsInsertError} = await supabase 
                            .from('clips')
                            .insert(newClips);
                        if(clipsInsertError){
                            throw clipsInsertError;
                        }
                    }
                }
            }

            //update UI
            setProjects(prev => [newProject, ...prev]);
            setOpenMenuProjectId(null);

        } catch(err){
            console.error('Failed to copy project:', err);
            //setErrorMsg(err?.message || 'Failed to copy project');
        } finally {
            setLoading(false);
        }
    };

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
        <div className="projects-container">
            <h2>Your Projects</h2>

            <div className="new-project-section">
                <input
                    type="text"
                    placeholder="New project name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                />
                <button onClick={createProject}>Create Project</button>
            </div>

            {errorMsg && <p className="error-message">{errorMsg}</p>}

            {openMenuProjectId && (
                <div
                    onClick={() => setOpenMenuProjectId(null)}
                    className="menu-backdrop"
                />
            )}

            <ol>
                {projects.map((project) => (
                    <li key={project.id} className="project-item">
                        <button onClick={() => onSelectProject(project.id)}>{project.name}</button>
                        <button 
                            onClick={() => setOpenMenuProjectId(openMenuProjectId === project.id ? null : project.id)}
                            aria-label="Project settings"
                            className="menu-trigger-btn"
                            >⋮</button>

                        {openMenuProjectId === project.id && (
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="project-menu-dropdown"
                    >
                        <div className="menu-section">
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
 
                        <div className="menu-section">
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
                                <div className="invite-status-text">{inviteStatus[project.id]}</div>
                            )}
                        </div>

                        <button 
                            className="dropdown-item" 
                            onClick={() => handleMakeCopy(project)}
                            >
                            Make a copy
                        </button>
 
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