import { createSupabaseServerClient } from "./supabase-server";
import type { Category, Client, CheckIn } from "./metrics";

export interface Profile {
  id: string;
  display_name: string | null;
}

export async function fetchData(): Promise<{
  clients: Client[];
  checkIns: CheckIn[];
  categories: Category[];
  profiles: Profile[];
}> {
  const supabase = await createSupabaseServerClient();
  const [clientsRes, checkInsRes, typesRes, profilesRes] = await Promise.all([
    supabase.from("clients").select("*").order("name"),
    supabase.from("check_ins").select("*"),
    supabase.from("check_in_types").select("*").order("precedence"),
    supabase.from("profiles").select("id, display_name"),
  ]);
  if (clientsRes.error) throw clientsRes.error;
  if (checkInsRes.error) throw checkInsRes.error;
  if (typesRes.error) throw typesRes.error;
  if (profilesRes.error) throw profilesRes.error;
  return {
    clients: (clientsRes.data ?? []) as Client[],
    checkIns: (checkInsRes.data ?? []) as CheckIn[],
    categories: (typesRes.data ?? []) as Category[],
    profiles: (profilesRes.data ?? []) as Profile[],
  };
}
