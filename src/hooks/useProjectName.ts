import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export function useProjectName(projectId: string | null) {
    const [name, setName] = useState<string>('project-export');

    useEffect(() => {
        if (!projectId) {
            setName('project-export');
            return;
        }
        supabase
            .from('projects')
            .select('name')
            .eq('id', projectId)
            .single()
            .then(({ data, error }) => {
                if (!error && data) setName(data.name);
            });
    }, [projectId]);

    return name;
}