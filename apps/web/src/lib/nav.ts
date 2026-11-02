export interface NavItem {
  href: string;
  label: string;
  icon: string;
  keywords?: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/app", label: "Dashboard", icon: "LayoutDashboard", keywords: "home daily plan" },
      { href: "/app/notifications", label: "Notifications", icon: "Bell" },
      { href: "/app/calendar", label: "Calendar & Tasks", icon: "CalendarDays", keywords: "reminders" },
    ],
  },
  {
    label: "Job search",
    items: [
      { href: "/app/discover", label: "Discover Jobs", icon: "Compass", keywords: "recommendations alerts" },
      { href: "/app/portals", label: "Job Portal Hub", icon: "Globe", keywords: "naukri linkedin indeed" },
      { href: "/app/saved", label: "Saved Opportunities", icon: "Bookmark" },
      { href: "/app/applications", label: "Applications", icon: "Briefcase", keywords: "tracker" },
      { href: "/app/workspace", label: "Universal Workspace", icon: "PanelsTopLeft" },
      { href: "/app/review", label: "Needs Review", icon: "Inbox", keywords: "gmail emails" },
    ],
  },
  {
    label: "Documents & AI",
    items: [
      { href: "/app/resume", label: "AI Resume Studio", icon: "FileText", keywords: "tailor cv" },
      { href: "/app/cover-letters", label: "Cover Letters", icon: "Mail" },
      { href: "/app/copilot", label: "Application Copilot", icon: "Sparkles", keywords: "answers questions" },
      { href: "/app/documents", label: "Documents", icon: "FolderLock", keywords: "vault" },
    ],
  },
  {
    label: "Interviews & skills",
    items: [
      { href: "/app/interview", label: "Interview Studio", icon: "MessagesSquare", keywords: "mock prep" },
      { href: "/app/scenarios", label: "Scenario Lab", icon: "FlaskConical" },
      { href: "/app/skills", label: "Skills Academy", icon: "GraduationCap", keywords: "sql excel learning" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/app/strategy", label: "Career Strategy", icon: "Target" },
      { href: "/app/analytics", label: "Analytics", icon: "ChartColumn" },
    ],
  },
  {
    label: "Network & research",
    items: [
      { href: "/app/companies", label: "Company Research", icon: "Building2" },
      { href: "/app/recruiters", label: "Recruiter CRM", icon: "Contact" },
      { href: "/app/messages", label: "Recruiter Messages", icon: "Send", keywords: "outreach referral follow-up" },
    ],
  },
  {
    label: "Offers & safety",
    items: [
      { href: "/app/offers", label: "Offers & Salary", icon: "BadgeIndianRupee", keywords: "ctc take-home negotiation" },
      { href: "/app/scam-check", label: "Scam Detector", icon: "ShieldAlert" },
    ],
  },
  {
    label: "You",
    items: [
      { href: "/app/profile", label: "My Career Profile", icon: "UserRound" },
      { href: "/app/linkedin", label: "LinkedIn & Portfolio", icon: "Linkedin" },
      { href: "/app/launchpad", label: "Fresher Launchpad", icon: "Rocket" },
      { href: "/app/career-tools", label: "Experienced Tools", icon: "Route", keywords: "transition gap" },
      { href: "/app/settings", label: "Settings", icon: "Settings", keywords: "gmail ai privacy export delete" },
    ],
  },
];
