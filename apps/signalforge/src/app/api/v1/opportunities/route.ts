import { handleCatalog } from "@/server/intelligence/http";
export const runtime="nodejs";
export const GET=(request:Request)=>handleCatalog(request,"opportunities");
