import { Redirect, Tabs } from "expo-router";
import { View, type ColorValue } from "react-native";
import { ClipboardList, LayoutDashboard, Menu, UsersRound, type LucideIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Loading } from "@/components/ui";
import { colors, fontFamilies } from "@/theme";

/** Tab icon; the active tab gets a small primary-tinted pill behind it. */
function tabIcon(Icon: LucideIcon) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return (
      <View
        style={{
          width: 52,
          height: 30,
          borderRadius: 15,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: focused ? colors.primarySoft : "transparent",
        }}
      >
        <Icon size={22} color={String(color)} strokeWidth={focused ? 2.4 : 2} />
      </View>
    );
  };
}

export default function TabsLayout() {
  const { ready, user } = useAuth();
  const insets = useSafeAreaInsets();

  if (!ready) return <Loading label="Starting…" />;
  if (!user) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        header: ({ options }) => <AppHeader title={String(options.title ?? "")} />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontSize: 11, fontFamily: fontFamilies["600"] },
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          // A fixed height replaces the default safe-area padding, so add the
          // device's bottom inset back or the bar sits under the system buttons.
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: 6 + insets.bottom,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Overview", tabBarIcon: tabIcon(LayoutDashboard) }} />
      <Tabs.Screen name="participants" options={{ title: "Participants", tabBarIcon: tabIcon(UsersRound) }} />
      <Tabs.Screen name="surveys" options={{ title: "Surveys", tabBarIcon: tabIcon(ClipboardList) }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: tabIcon(Menu) }} />
    </Tabs>
  );
}
