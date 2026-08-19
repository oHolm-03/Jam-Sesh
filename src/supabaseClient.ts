import {createClient} from '@supabase/supabase-js';

const supabaseUrl = 'https://wnfkvkrcgykpoovfgtan.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduZmt2a3JjZ3lrcG9vdmZndGFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI5MTIsImV4cCI6MjEwMjY2ODkxMn0.tWCY7JFKTokYI5WIEeLeAwijBHjCIW2zKPl7h1cZ09U';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);