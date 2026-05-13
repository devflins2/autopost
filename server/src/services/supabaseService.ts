// This service is disabled. Using ImageKit instead.
export const uploadToSupabase = async (file: any) => {
  throw new Error("Supabase is deprecated. Use ImageKit.");
};

export const deleteFromSupabase = async (path: string) => {
  console.log("Supabase delete called (Disabled)");
};
