import React, {useState, useEffect} from 'react';
import {supabase} from './supabaseClient';

type Project = {
    id: string;
    name: string;
    created_at: string;
    created_by: string;
}

const Projects = ({onSelectProject}: {onSelectProject: (id: string) => void}) => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [newProjectName, setNewProjectName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [inviteUsername, setInviteUsername] = useState<Record<string, string>>({});
    const [inviteStatus, setInviteStatus] = useState<Record<string, string>>({});
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    const fetchProjects = async () => {
        //only returning rows where user is actually a project member
        const {data, error} = await supabase
            .from('projects')
            .select('id, name, created_at, created_by')
            .order('created_at', {ascending: false});

        if(error){
            setErrorMsg(error.message);
        } else if(data) {
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
        if(!newProjectName.trim()) return;

        const {data: userData} = await supabase.auth.getUser();
        const userId = userData.user?.id;
        console.log('Current user ID:', userId); // temporary debug line

        if(!userId) return;

        const {data: project, error: projectError} = await supabase
            .from('projects')
            .insert({name: newProjectName, created_by: userId})
            .select()
            .single();

        if(projectError || !project) {
            setErrorMsg(projectError?.message ?? 'Failed to create project');
            return;
        }

        // add yourself as a member, so later you and invited bandmates see it
        const {error: memberError} = await supabase
            .from('project_members')
            .insert({project_id: project.id, user_id: userId});

        if (memberError) {
            setErrorMsg(memberError.message);
            return;
        }

        setNewProjectName('');
        fetchProjects();
    };

    const inviteToProject = async (projectId: string) => {
        const username = inviteUsername[projectId]?.trim();
        if(!username) return;

        //Lookup invitee's user ID by username
        const {data: profile, error: lookupError} = await supabase  
            .from('profiles')
            .select('id')
            .eq('username', username)
            .single();

        if(lookupError || !profile) {
            setInviteStatus((prev) => ({ ...prev, [projectId]: 'No user found with that username'}));
            return;
        }

        const {error: insertError} = await supabase
            .from('project_members')
            .insert({project_id: projectId, user_id: profile.id});

        if(insertError){
            setInviteStatus((prev) => ({ ...prev, [projectId]: insertError.message}));
        } else {
            setInviteStatus((prev) => ({ ...prev, [projectId]: 'Added!'}));
            setInviteUsername((prev) => ({ ...prev, [projectId]: ''}));
        }
    }

    const deleteProject = async (projectId: string, projectName: string) => {
        const confirmed = window.confirm(`Delete "${projectName}"? This will permanently remove it and all its recordings for everyone.`);
        if(!confirmed) return;

        const {error} = await supabase.from('projects').delete().eq('id', projectId);

        if(error) {
            setErrorMsg(error.message);
        } else {
            fetchProjects();
        }
    };

    return(
        <div style={{padding: 40, fontFamily: 'sans-serif'}}>
            <h2>Your Projects</h2>

            <div style={{marginBottom: 20}}>
                <input
                    type="text"
                    placeholder="New project name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                />
                <button onClick={createProject}>Create Project</button>
            </div>

            {errorMsg && <p style={{color: 'red'}}>{errorMsg}</p>}

            <ol>
            {projects.map((project) => (
                <li key={project.id} style={{ marginBottom: 15 }}>
                <button onClick={() => onSelectProject(project.id)}>{project.name}</button>
                {project.created_by === currentUserId && (
                    <button onClick={() => deleteProject(project.id, project.name)} style={{marginLeft: 5}}> Delete </button>
                )}
                <div style={{ marginTop: 5 }}>
                    <input
                    type="text"
                    placeholder="Bandmate's username"
                    value={inviteUsername[project.id] || ''}
                    onChange={(e) =>
                        setInviteUsername((prev) => ({ ...prev, [project.id]: e.target.value }))
                    }
                    />
                    <button onClick={() => inviteToProject(project.id)}>Invite</button>
                    {inviteStatus[project.id] && <span style={{ marginLeft: 10 }}>{inviteStatus[project.id]}</span>}
                </div>
                </li>
            ))}
            </ol>
        </div>
        
    );
};

export default Projects;