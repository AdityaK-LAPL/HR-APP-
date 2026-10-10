import type { HierarchyNode } from './queries'

export interface TreeNode extends HierarchyNode {
  children: TreeNode[]
}

/** The API returns a flat list; roots are nodes whose manager is not part of the (scoped) list. */
export function buildTree(nodes: readonly HierarchyNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(nodes.map((node) => [node.id, { ...node, children: [] }]))
  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.manager_id ? byId.get(node.manager_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}
