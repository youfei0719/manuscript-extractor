import fs from "node:fs"
import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const virtualModuleId = "virtual:douyin-skill-repository"
const resolvedVirtualModuleId = `\0${virtualModuleId}`

function skillRepositoryPlugin(): Plugin {
  return {
    name: "douyin-skill-repository",
    resolveId(id) {
      return id === virtualModuleId ? resolvedVirtualModuleId : null
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) return null
      const repositoryRoot = path.resolve(import.meta.dirname, "..")
      const manifest = JSON.parse(
        fs.readFileSync(path.join(repositoryRoot, "published/stable/manifest.json"), "utf8"),
      ) as { version: string; updated_at: string; package_path: string }
      const skillsPath = path.join(
        repositoryRoot,
        manifest.package_path,
        "runtime/references/skills.json",
      )
      const skills = JSON.parse(fs.readFileSync(skillsPath, "utf8")) as {
        name: string
        version: string
        skills: unknown[]
      }
      const runtimeRoot = path.join(repositoryRoot, manifest.package_path, "runtime")
      const runtimeFiles: Record<string, string> = {}
      const visit = (directory: string) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const absolute = path.join(directory, entry.name)
          if (entry.isDirectory()) visit(absolute)
          else if (entry.isFile() && [".md", ".json"].includes(path.extname(entry.name))) {
            runtimeFiles[path.relative(runtimeRoot, absolute).split(path.sep).join("/")] = fs.readFileSync(absolute, "utf8")
          }
        }
      }
      visit(runtimeRoot)
      const payload = {
        version: manifest.version,
        updatedAt: manifest.updated_at,
        packagePath: manifest.package_path,
        name: skills.name,
        skills: skills.skills,
        runtimeFiles,
      }
      return `export default ${JSON.stringify(payload)}`
    },
  }
}

export default defineConfig({
  plugins: [react(), skillRepositoryPlugin()],
})
