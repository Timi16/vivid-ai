import { Redirect } from "expo-router";

// "/" while signed out is the sign-in screen.
export default function AuthIndex() {
  return <Redirect href="/sign-in" />;
}
