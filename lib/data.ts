import { supabase } from "./supabase";
import type { Client, CheckIn } from "./metrics";

export async function fetchData(): Promise<{ clients: Client[]; checkIns: CheckIn[] }> {
  const [clientsRes, checkInsRes] = await Promise.all([
    supabase.from("clients").select("*").order("name"),
    supabase.from("check_ins").select("*"),
  ]);
  if (clientsRes.error) throw clientsRes.error;
  if (checkInsRes.error) throw checkInsRes.error;
  return {
    clients: (clientsRes.data ?? []) as Client[],
    checkIns: (checkInsRes.data ?? []) as CheckIn[],
  };
}
