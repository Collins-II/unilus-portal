import NextAuth from "next-auth";
import { authOptions } from "@/lib/server/auth";

const auth = NextAuth(authOptions);

export { auth as GET, auth as POST };
