import { createSupabaseServerClient } from "./supabase-server";
import type { Category, Client, CheckIn } from "./metrics";

export async function fetchData(): Promise<{
  clients: Client[];
  checkIns: CheckIn[];
  categories: Category[];
}> {
  const supabase = await createSupabaseServerClient();
  const [clientsRes, checkInsRes, typesRes] = await Promise.all([
    supabase.from("clients").select("*").order("name"),
    supabase.from("check_ins").select("*"),
    supabase.from("check_in_types").select("*").order("precedence"),
  ]);
  if (clientsRes.error) throw clientsRes.error;
  if (checkInsRes.error) throw checkInsRes.error;
  if (typesRes.error) throw typesRes.error;
  return {
    clients: (clientsRes.data ?? []) as Client[],
    checkIns: (checkInsRes.data ?? []) as CheckIn[],
    categories: (typesRes.data ?? []) as Category[],
  };
}
