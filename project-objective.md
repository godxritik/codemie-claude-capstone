# Capstone Project: AI-Assistant–Driven SDLC with Human-in-the-Loop & Tooling

## Project Objective

The objective is to build an agentic pipeline/workflows using skills for each persona (BA, QA, Dev etc.) where every SDLC phase is powered by AI Assistants and specialized tools, integrated with a human-in-the-loop (HITL) feedback mechanism to ensure quality, accountability, and enterprise-grade automation.

**Application:** Choose an existing functional application with limited features, apply the AI-driven SDLC to analyze and identify gaps and potential enhancements, develop an implementation plan, and execute the improvements.

The **value is not the app/feature complexity**, but the **AI-Assistant orchestration**

- Refer to the assistants available in Marketplace and available Templates for assistant creation
- Multiple assistants may be joined together to form workflow as applicable
- Use integrations, data sources, tools, mcp, plugins as applicable

---

## Key Deliverables

- **Analysis**
  - Identify enhancements using AI Assistant.
  - EPIC/User stories/Tasks are created/updated for above enhancements in JIRA
- **Plan**
  - Generate/Create plan for implementing the enhancements.
- **Design**
  - Architecture document/diagram
  - High level design
  - Low level design
  - Wireframes
- **Development**
  - Code generation (front end + back end) [code language(s) of your choice, IDE - your choice]: **must use claude-code cli via codemie**
  - Database scripts [if applicable - any open source light weight DB]
  - Code and scripts should be committed in git.
  - Code Review – comments added in git
- **Documentation**
  - FRD/Architecture/Design/Wireframes documents should be stored in confluence
  - Readme - part of the code base
- **Build**
  - Build scripts
  - Execute build scripts and generate deployable artefact
  - Build scripts committed to git
- **Testing**
  - Generate Test Cases in gherkin format
  - Generate Automated Test Scripts
  - Execute Test Scripts and store execution results/report (using playwright)
  - All the above should be committed to Jira / Confluence as applicable
- **Deployment**
  - Project should be deployed on local env.

---

## Demo Flow

1. Gaps/Enhancements identified (CodeMie, Jira)
2. Requirement Assistant generates stories → Human review
3. Plan is generated and create a Pull Request (Codemie and Git)
4. Design Assistant creates architecture/design (Confluence) → Human review
5. Code Assistant writes/commits code (Claude-Code, Git) → Human review
6. Code Review Assistant (Codemie, Git) → Human review
7. Test Assistant validates code (*Selenium, JUnit*) → Human review
8. Deployment Assistant deploys (Local Deployment) → Human review
9. Documentation Assistant updates docs (Confluence) → Human review