/**
 * Mock Interview Meta Data
 * Departments and Job Roles configuration
 * FULL SYNC WITH 16-DEPT / 128-ROLE ENTERPRISE HIERARCHY
 */

const DEPARTMENTS = [
  { id: 1, name: "Human Resources (HR)", slug: "human-resources", description: "People management, recruiting, and culture.", color_hex: "#EC4899", icon_url: "users", role_count: 8 },
  { id: 2, name: "Sales & Business Development", slug: "sales-business", description: "Revenue, client acquisition, and growth.", color_hex: "#F59E0B", icon_url: "trending-up", role_count: 8 },
  { id: 3, name: "Marketing (Digital & Growth)", slug: "marketing-digital", description: "Brand, SEO, and social strategy.", color_hex: "#06B6D4", icon_url: "bar-chart", role_count: 8 },
  { id: 4, name: "Finance & FinTech", slug: "finance-fintech", description: "Accounting, fintech, and analysis.", color_hex: "#10B981", icon_url: "wallet", role_count: 8 },
  { id: 5, name: "Customer Success", slug: "customer-success", description: "Support, success, and client onboarding.", color_hex: "#8B5CF6", icon_url: "heart", role_count: 8 },
  { id: 6, name: "Operations & Business Ops", slug: "operations-ops", description: "Process, logistics, and program ops.", color_hex: "#6366F1", icon_url: "settings", role_count: 8 },
  { id: 7, name: "IT / Software", slug: "it-software", description: "Development, QA, and cloud engineering.", color_hex: "#F43F5E", icon_url: "code", role_count: 8 },
  { id: 8, name: "Data & Analytics", slug: "data-analytics", description: "Data science, BI, and analytics.", color_hex: "#14B8A6", icon_url: "database", role_count: 8 },
  { id: 9, name: "AI & Gen AI", slug: "ai-gen-ai", description: "Machine learning and prompt engineering.", color_hex: "#F97316", icon_url: "cpu", role_count: 8 },
  { id: 10, name: "Product & UX", slug: "product-ux", description: "Product management and user experience.", color_hex: "#8B5CF6", icon_url: "layout", role_count: 8 },
  { id: 11, name: "Content & Communication", slug: "content-communication", description: "Writing and communication strategy.", color_hex: "#A855F7", icon_url: "file-text", role_count: 8 },
  { id: 12, name: "Media & Creative", slug: "media-creative", description: "Design, video, and visual media.", color_hex: "#EF4444", icon_url: "camera", role_count: 8 },
  { id: 13, name: "Education & EdTech", slug: "education-edtech", description: "Training and instructional design.", color_hex: "#EAB308", icon_url: "book-open", role_count: 8 },
  { id: 14, name: "Logistics & Supply Chain", slug: "logistics-supply", description: "Supply chain and inventory management.", color_hex: "#0EA5E9", icon_url: "truck", role_count: 8 },
  { id: 15, name: "BFSI & FinTech", slug: "bfsi-fintech", description: "Banking and financial operations.", color_hex: "#3B82F6", icon_url: "briefcase", role_count: 8 },
  { id: 16, name: "Entrepreneurship / Startups", slug: "entrepreneurship-startups", description: "Venture, growth, and startup ops.", color_hex: "#6366F1", icon_url: "rocket", role_count: 8 }
];

const JOB_ROLES = [
  // --- 1. HUMAN RESOURCES (HR) ---
  { id: 1, department_id: 1, title: "HR Executive", slug: "hr-executive", difficulty_level: "Intermediate" },
  { id: 2, department_id: 1, title: "Recruiter", slug: "recruiter", difficulty_level: "Intermediate" },
  { id: 3, department_id: 1, title: "Talent Acquisition Associate", slug: "talent-acquisition", difficulty_level: "Intermediate" },
  { id: 4, department_id: 1, title: "HR Operations Assistant", slug: "hr-ops-assistant", difficulty_level: "Beginner" },
  { id: 5, department_id: 1, title: "HR Intern", slug: "hr-intern", difficulty_level: "Beginner" },
  { id: 6, department_id: 1, title: "People Analytics Associate", slug: "people-analytics", difficulty_level: "Advanced" },
  { id: 7, department_id: 1, title: "HR Tech Coordinator", slug: "hr-tech", difficulty_level: "Intermediate" },
  { id: 8, department_id: 1, title: "Employee Experience Executive", slug: "employee-experience", difficulty_level: "Intermediate" },

  // --- 2. SALES & BUSINESS DEVELOPMENT ---
  { id: 9, department_id: 2, title: "Sales Executive", slug: "sales-executive", difficulty_level: "Intermediate" },
  { id: 10, department_id: 2, title: "Inside Sales Rep", slug: "inside-sales", difficulty_level: "Beginner" },
  { id: 11, department_id: 2, title: "Business Development Associate", slug: "biz-dev-associate", difficulty_level: "Intermediate" },
  { id: 12, department_id: 2, title: "Lead Generation Executive", slug: "lead-gen", difficulty_level: "Beginner" },
  { id: 13, department_id: 2, title: "SaaS Sales Executive", slug: "saas-sales", difficulty_level: "Advanced" },
  { id: 14, department_id: 2, title: "Pre-Sales Executive", slug: "pre-sales", difficulty_level: "Intermediate" },
  { id: 15, department_id: 2, title: "Customer Acquisition Executive", slug: "customer-acquisition", difficulty_level: "Intermediate" },
  { id: 16, department_id: 2, title: "Growth Sales Associate", slug: "growth-sales", difficulty_level: "Intermediate" },

  // --- 3. MARKETING (DIGITAL & GROWTH) ---
  { id: 17, department_id: 3, title: "Digital Marketing Executive", slug: "digital-marketing", difficulty_level: "Intermediate" },
  { id: 18, department_id: 3, title: "Social Media Executive", slug: "social-media", difficulty_level: "Beginner" },
  { id: 19, department_id: 3, title: "SEO Executive", slug: "seo-executive", difficulty_level: "Intermediate" },
  { id: 20, department_id: 3, title: "Performance Marketing Executive", slug: "performance-marketing", difficulty_level: "Advanced" },
  { id: 21, department_id: 3, title: "Content Marketing Associate", slug: "content-marketing", difficulty_level: "Beginner" },
  { id: 22, department_id: 3, title: "Influencer Marketing Executive", slug: "influencer-marketing", difficulty_level: "Intermediate" },
  { id: 23, department_id: 3, title: "Growth Marketing Associate", slug: "growth-marketing", difficulty_level: "Intermediate" },
  { id: 24, department_id: 3, title: "Marketing Analyst", slug: "marketing-analyst", difficulty_level: "Advanced" },

  // --- 4. FINANCE & FINTECH ---
  { id: 25, department_id: 4, title: "Accounts Executive", slug: "accounts-executive", difficulty_level: "Beginner" },
  { id: 26, department_id: 4, title: "Junior Accountant", slug: "jr-accountant", difficulty_level: "Beginner" },
  { id: 27, department_id: 4, title: "Financial Analyst (Jr)", slug: "financial-analyst", difficulty_level: "Intermediate" },
  { id: 28, department_id: 4, title: "FinTech Operations Executive", slug: "fintech-ops", difficulty_level: "Intermediate" },
  { id: 29, department_id: 4, title: "Billing Executive", slug: "billing-executive", difficulty_level: "Beginner" },
  { id: 30, department_id: 4, title: "Risk Analyst (Jr)", slug: "risk-analyst", difficulty_level: "Intermediate" },
  { id: 31, department_id: 4, title: "Investment Analyst (Jr)", slug: "investment-analyst", difficulty_level: "Advanced" },
  { id: 32, department_id: 4, title: "Payroll Executive", slug: "payroll-executive", difficulty_level: "Intermediate" },

  // --- 5. CUSTOMER SUCCESS ---
  { id: 33, department_id: 5, title: "Customer Support Executive", slug: "customer-support", difficulty_level: "Beginner" },
  { id: 34, department_id: 5, title: "Customer Success Associate", slug: "customer-success", difficulty_level: "Intermediate" },
  { id: 35, department_id: 5, title: "SaaS Support Executive", slug: "saas-support", difficulty_level: "Intermediate" },
  { id: 36, department_id: 5, title: "Technical Support Associate", slug: "tech-support", difficulty_level: "Beginner" },
  { id: 37, department_id: 5, title: "Chat Support Executive", slug: "chat-support", difficulty_level: "Beginner" },
  { id: 38, department_id: 5, title: "Client Onboarding Executive", slug: "client-onboarding", difficulty_level: "Intermediate" },
  { id: 39, department_id: 5, title: "Customer Experience Associate", slug: "customer-experience", difficulty_level: "Intermediate" },
  { id: 40, department_id: 5, title: "Helpdesk Executive", slug: "helpdesk-executive", difficulty_level: "Beginner" },

  // --- 6. OPERATIONS & BUSINESS OPS ---
  { id: 41, department_id: 6, title: "Operations Executive", slug: "operations-executive", difficulty_level: "Intermediate" },
  { id: 42, department_id: 6, title: "Process Associate", slug: "process-associate", difficulty_level: "Beginner" },
  { id: 43, department_id: 6, title: "MIS Executive", slug: "mis-executive", difficulty_level: "Intermediate" },
  { id: 44, department_id: 6, title: "Business Ops Associate", slug: "business-ops", difficulty_level: "Intermediate" },
  { id: 45, department_id: 6, title: "Vendor Ops Executive", slug: "vendor-ops", difficulty_level: "Intermediate" },
  { id: 46, department_id: 6, title: "Supply Ops Executive", slug: "supply-ops", difficulty_level: "Intermediate" },
  { id: 47, department_id: 6, title: "Quality Analyst", slug: "quality-analyst", difficulty_level: "Intermediate" },
  { id: 48, department_id: 6, title: "Program Ops Associate", slug: "program-ops", difficulty_level: "Advanced" },

  // --- 7. IT / SOFTWARE ---
  { id: 49, department_id: 7, title: "Junior Software Developer", slug: "jr-software-dev", difficulty_level: "Beginner" },
  { id: 50, department_id: 7, title: "Web Developer", slug: "web-developer", difficulty_level: "Intermediate" },
  { id: 51, department_id: 7, title: "QA Tester", slug: "qa-tester", difficulty_level: "Beginner" },
  { id: 52, department_id: 7, title: "Technical Support Engineer", slug: "tech-support-engineer", difficulty_level: "Intermediate" },
  { id: 53, department_id: 7, title: "System Admin (Jr)", slug: "system-admin", difficulty_level: "Intermediate" },
  { id: 54, department_id: 7, title: "DevOps Trainee", slug: "devops-trainee", difficulty_level: "Advanced" },
  { id: 55, department_id: 7, title: "Cloud Support Associate", slug: "cloud-support", difficulty_level: "Intermediate" },
  { id: 56, department_id: 7, title: "API Support Engineer", slug: "api-support", difficulty_level: "Advanced" },

  // --- 8. DATA & ANALYTICS ---
  { id: 57, department_id: 8, title: "Data Analyst (Jr)", slug: "data-analyst", difficulty_level: "Beginner" },
  { id: 58, department_id: 8, title: "Business Analyst (Jr)", slug: "business-analyst", difficulty_level: "Intermediate" },
  { id: 59, department_id: 8, title: "Data Visualization Associate", slug: "data-viz", difficulty_level: "Intermediate" },
  { id: 60, department_id: 8, title: "BI Analyst (Jr)", slug: "bi-analyst", difficulty_level: "Intermediate" },
  { id: 61, department_id: 8, title: "Reporting Analyst", slug: "reporting-analyst", difficulty_level: "Beginner" },
  { id: 62, department_id: 8, title: "Data Quality Analyst", slug: "data-quality", difficulty_level: "Intermediate" },
  { id: 63, department_id: 8, title: "Product Analyst (Jr)", slug: "product-analyst", difficulty_level: "Intermediate" },
  { id: 64, department_id: 8, title: "Excel Analyst", slug: "excel-analyst", difficulty_level: "Beginner" },

  // --- 9. AI & GEN AI ---
  { id: 65, department_id: 9, title: "AI/ML Intern", slug: "ai-ml-intern", difficulty_level: "Beginner" },
  { id: 66, department_id: 9, title: "Gen AI Associate", slug: "gen-ai-associate", difficulty_level: "Intermediate" },
  { id: 67, department_id: 9, title: "Prompt Engineer (Jr)", slug: "prompt-engineer", difficulty_level: "Intermediate" },
  { id: 68, department_id: 9, title: "AI Chatbot Trainer", slug: "ai-chatbot-trainer", difficulty_level: "Beginner" },
  { id: 69, department_id: 9, title: "NLP Associate", slug: "nlp-associate", difficulty_level: "Advanced" },
  { id: 70, department_id: 9, title: "AI Data Trainer", slug: "ai-data-trainer", difficulty_level: "Beginner" },
  { id: 71, department_id: 9, title: "MLOps Assistant", slug: "mlops-assistant", difficulty_level: "Advanced" },
  { id: 72, department_id: 9, title: "AI Research Assistant", slug: "ai-research", difficulty_level: "Advanced" },

  // --- 10. PRODUCT & UX ---
  { id: 73, department_id: 10, title: "Product Associate", slug: "product-associate", difficulty_level: "Intermediate" },
  { id: 74, department_id: 10, title: "Product Analyst (Jr)", slug: "product-analyst-ux", difficulty_level: "Intermediate" },
  { id: 75, department_id: 10, title: "UX Writer", slug: "ux-writer", difficulty_level: "Intermediate" },
  { id: 76, department_id: 10, title: "UX Research Assistant", slug: "ux-research", difficulty_level: "Beginner" },
  { id: 77, department_id: 10, title: "UI Designer", slug: "ui-designer-product", difficulty_level: "Intermediate" },
  { id: 78, department_id: 10, title: "UX Designer (Jr)", slug: "ux-designer-jr", difficulty_level: "Beginner" },
  { id: 79, department_id: 10, title: "Product Ops Associate", slug: "product-ops", difficulty_level: "Intermediate" },
  { id: 80, department_id: 10, title: "Design Research Associate", slug: "design-research", difficulty_level: "Intermediate" },

  // --- 11. CONTENT & COMMUNICATION ---
  { id: 81, department_id: 11, title: "Content Writer", slug: "content-writer", difficulty_level: "Beginner" },
  { id: 82, department_id: 11, title: "Copywriter", slug: "copywriter", difficulty_level: "Intermediate" },
  { id: 83, department_id: 11, title: "UX Writer", slug: "ux-writer-content", difficulty_level: "Intermediate" },
  { id: 84, department_id: 11, title: "Technical Writer (Jr)", slug: "tech-writer", difficulty_level: "Intermediate" },
  { id: 85, department_id: 11, title: "Content Editor", slug: "content-editor", difficulty_level: "Intermediate" },
  { id: 86, department_id: 11, title: "Script Writer", slug: "script-writer", difficulty_level: "Intermediate" },
  { id: 87, department_id: 11, title: "SEO Content Writer", slug: "seo-content", difficulty_level: "Intermediate" },
  { id: 88, department_id: 11, title: "Communication Executive", slug: "communication-executive", difficulty_level: "Intermediate" },

  // --- 12. MEDIA & CREATIVE ---
  { id: 89, department_id: 12, title: "Graphic Designer", slug: "graphic-designer", difficulty_level: "Intermediate" },
  { id: 90, department_id: 12, title: "Video Editor", slug: "video-editor", difficulty_level: "Intermediate" },
  { id: 91, department_id: 12, title: "Motion Graphics Designer", slug: "motion-graphics", difficulty_level: "Advanced" },
  { id: 92, department_id: 12, title: "Visual Designer", slug: "visual-designer", difficulty_level: "Intermediate" },
  { id: 93, department_id: 12, title: "UI Designer", slug: "ui-designer-media", difficulty_level: "Intermediate" },
  { id: 94, department_id: 12, title: "Social Media Designer", slug: "social-media-designer", difficulty_level: "Beginner" },
  { id: 95, department_id: 12, title: "Creative Assistant", slug: "creative-assistant", difficulty_level: "Beginner" },
  { id: 96, department_id: 12, title: "Brand Design Associate", slug: "brand-design", difficulty_level: "Intermediate" },

  // --- 13. EDUCATION & EDTECH ---
  { id: 97, department_id: 13, title: "Trainer Assistant", slug: "trainer-assistant", difficulty_level: "Beginner" },
  { id: 98, department_id: 13, title: "Instructional Design Associate", slug: "instructional-design", difficulty_level: "Intermediate" },
  { id: 99, department_id: 13, title: "Academic Coordinator", slug: "academic-coordinator", difficulty_level: "Intermediate" },
  { id: 100, department_id: 13, title: "Learning Experience Designer", slug: "lx-designer", difficulty_level: "Intermediate" },
  { id: 101, department_id: 13, title: "Teaching Assistant", slug: "teaching-assistant", difficulty_level: "Beginner" },
  { id: 102, department_id: 13, title: "Program Coordinator", slug: "program-coordinator", difficulty_level: "Intermediate" },
  { id: 103, department_id: 13, title: "Curriculum Developer (Jr)", slug: "curriculum-dev", difficulty_level: "Intermediate" },
  { id: 104, department_id: 13, title: "Learning Support Executive", slug: "learning-support", difficulty_level: "Beginner" },

  // --- 14. LOGISTICS & SUPPLY CHAIN ---
  { id: 105, department_id: 14, title: "Logistics Executive", slug: "logistics-executive", difficulty_level: "Intermediate" },
  { id: 106, department_id: 14, title: "Supply Chain Coordinator", slug: "supply-chain-coord", difficulty_level: "Intermediate" },
  { id: 107, department_id: 14, title: "Inventory Executive", slug: "inventory-executive", difficulty_level: "Beginner" },
  { id: 108, department_id: 14, title: "Procurement Assistant", slug: "procurement-assistant", difficulty_level: "Beginner" },
  { id: 109, department_id: 14, title: "Dispatch Executive", slug: "dispatch-executive", difficulty_level: "Beginner" },
  { id: 110, department_id: 14, title: "Vendor Management Executive", slug: "vendor-management", difficulty_level: "Intermediate" },
  { id: 111, department_id: 14, title: "Warehouse Executive", slug: "warehouse-executive", difficulty_level: "Beginner" },
  { id: 112, department_id: 14, title: "Operations Analyst", slug: "ops-analyst-logistics", difficulty_level: "Intermediate" },

  // --- 15. BFSI & FINTECH ---
  { id: 113, department_id: 15, title: "Banking Associate", slug: "banking-associate", difficulty_level: "Beginner" },
  { id: 114, department_id: 15, title: "Relationship Executive", slug: "relationship-executive", difficulty_level: "Intermediate" },
  { id: 115, department_id: 15, title: "Loan Processing Executive", slug: "loan-processing", difficulty_level: "Beginner" },
  { id: 116, department_id: 15, title: "KYC Executive", slug: "kyc-executive", difficulty_level: "Beginner" },
  { id: 117, department_id: 15, title: "Insurance Advisor", slug: "insurance-advisor", difficulty_level: "Beginner" },
  { id: 118, department_id: 15, title: "FinTech Support Executive", slug: "fintech-support", difficulty_level: "Intermediate" },
  { id: 119, department_id: 15, title: "Credit Analyst (Jr)", slug: "credit-analyst", difficulty_level: "Advanced" },
  { id: 120, department_id: 15, title: "Wealth Management Associate", slug: "wealth-management", difficulty_level: "Advanced" },

  // --- 16. ENTREPRENEURSHIP / STARTUPS ---
  { id: 121, department_id: 16, title: "Founder’s Office Associate", slug: "founders-office", difficulty_level: "Advanced" },
  { id: 122, department_id: 16, title: "Startup Operations Executive", slug: "startup-ops", difficulty_level: "Intermediate" },
  { id: 123, department_id: 16, title: "Growth Associate", slug: "growth-associate-startup", difficulty_level: "Intermediate" },
  { id: 124, department_id: 16, title: "Product Associate", slug: "product-associate-startup", difficulty_level: "Intermediate" },
  { id: 125, department_id: 16, title: "Business Analyst (Startup)", slug: "biz-analyst-startup", difficulty_level: "Intermediate" },
  { id: 126, department_id: 16, title: "Community Manager", slug: "community-manager", difficulty_level: "Beginner" },
  { id: 127, department_id: 16, title: "Partnerships Associate", slug: "partnerships-associate", difficulty_level: "Intermediate" },
  { id: 128, department_id: 16, title: "Venture Analyst (Jr)", slug: "venture-analyst", difficulty_level: "Advanced" }
];

module.exports = {
  DEPARTMENTS,
  JOB_ROLES: JOB_ROLES.map(role => ({
    ...role,
    question_count: 10,
    duration_minutes: 15
  }))
};
