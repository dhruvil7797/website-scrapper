import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAC_SKILLS_DIR = join(__dirname, 'mac-skills');

/**
 * Dynamically scan mac-skills/ directory and load all SKILL.md files.
 */
function loadAllSkills(): Map<string, string> {
  const skills = new Map<string, string>();
  try {
    const entries = readdirSync(MAC_SKILLS_DIR);
    for (const entry of entries) {
      const skillDir = join(MAC_SKILLS_DIR, entry);
      if (!statSync(skillDir).isDirectory()) continue;
      const skillFile = join(skillDir, 'SKILL.md');
      try {
        const content = readFileSync(skillFile, 'utf-8');
        if (content.trim()) {
          skills.set(entry, content);
        }
      } catch {
        // Skip directories without SKILL.md
      }
    }
  } catch {
    // mac-skills directory missing
  }
  return skills;
}

function loadLegacySkill(filename: string): string {
  try {
    return readFileSync(join(__dirname, filename), 'utf-8');
  } catch {
    return '';
  }
}

function loadFadekingzzSkill(skillName: string): string {
  try {
    const skillPath = join(__dirname, 'fadekingzz-steering', skillName, 'SKILL.md');
    return readFileSync(skillPath, 'utf-8');
  } catch {
    return '';
  }
}

// Cache loaded skills
let _allSkills: Map<string, string> | null = null;
function getAllSkills(): Map<string, string> {
  if (!_allSkills) {
    _allSkills = loadAllSkills();
  }
  return _allSkills;
}

/**
 * Load ALL design skills for website generation.
 * Dynamically scans mac-skills/ and includes legacy standalone skills.
 */
export function getDesignSkillsPrompt(): string {
  const skills = getAllSkills();

  // Also include legacy standalone skills not in mac-skills/
  const beautifulShadows = loadLegacySkill('beautiful-shadows-skill.md');
  const landingPage = loadLegacySkill('landing-page-skill.md');

  // Include fadekingzz steering skills (ui-styling, design-system)
  const uiStyling = loadFadekingzzSkill('ui-styling');
  const designSystemSkill = loadFadekingzzSkill('design-system');
  const uiUxProMax = loadFadekingzzSkill('ui-ux-pro-max');

  const sections: string[] = [];
  for (const [name, content] of skills) {
    sections.push(`## Skill: ${name}\n\n${content}`);
  }

  if (beautifulShadows.trim()) {
    sections.push(`## Skill: beautiful-shadows\n\n${beautifulShadows}`);
  }
  if (landingPage.trim()) {
    sections.push(`## Skill: landing-page\n\n${landingPage}`);
  }
  if (uiStyling.trim()) {
    sections.push(`## Skill: ui-styling (Tailwind + Shadcn)\n\n${uiStyling}`);
  }
  if (designSystemSkill.trim()) {
    sections.push(`## Skill: design-system-tokens\n\n${designSystemSkill}`);
  }
  if (uiUxProMax.trim()) {
    sections.push(`## Skill: ui-ux-pro-max (Database-driven design)\n\n${uiUxProMax}`);
  }

  return `
=== DESIGN SKILLS (Follow ALL of these strictly when creating websites) ===

${sections.join('\n\n---\n\n')}

=== END DESIGN SKILLS ===
`;
}

/**
 * Short version with the 3 most impactful skills for iteration prompts.
 */
export function getDesignSkillsShort(): string {
  const skills = getAllSkills();
  const frontendDesign = skills.get('frontend-design') || '';
  const bolder = skills.get('bolder') || '';
  const polish = skills.get('polish') || '';

  return `=== KEY DESIGN RULES ===

## frontend-design
${frontendDesign}

---

## bolder
${bolder}

---

## polish
${polish}

=== END ===`;
}

/**
 * QA evaluator skills - critique and audit only.
 */
export function getQaSkillsPrompt(): string {
  const skills = getAllSkills();
  const critique = skills.get('critique') || '';
  const audit = skills.get('audit') || '';

  const sections: string[] = [];
  if (critique.trim()) {
    sections.push(`## Skill: critique\n\n${critique}`);
  }
  if (audit.trim()) {
    sections.push(`## Skill: audit\n\n${audit}`);
  }

  return `
=== QA EVALUATION SKILLS ===

${sections.join('\n\n---\n\n')}

=== END QA SKILLS ===
`;
}
