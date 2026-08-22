import React, {useState, useEffect} from 'react';
import {supabase} from './supabaseClient';

type Project = {
    id: string;
    name: string;
    created_at: string;
}

const Projects = ({onSelectProject}: {onSelectProject: (id: string) => void}) => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [newProjectName, setNewProjectName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const fetchProjects = async () => {
        //only returning rows where user is actually a project member
        const {data, error} = await supabase
            .from('projects')
            .select('id, name, created_at')
            .order('created_at', {ascending: false});

        if(error){
            setErrorMsg(error.message);
        } else if(data) {
            setProjects(data);
        }
    };

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

            <ul>
                {projects.map((project) => (
                    <li key={project.id}>
                        {project.name}{' '}
                        <button onClick={() => onSelectProject(project.id)}>Open</button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default Projects;