import { Fragment } from "react"
import Link from "next/link"
import { parseMarkdown } from "@/lib/markdown"
import styles from "./FormattedText.module.css"

/**
 * Render text written with the formatting in lib/markdown.js (headings,
 * bold, italic, lists, links, tables). Everything is built as React elements, never
 * raw HTML. Used by the legal pages and the admin editor's preview.
 *
 * `sourceLines` marks each block with the line of text it came from
 * (data-line), so the admin editor can scroll its preview to match.
 */
export default function FormattedText({ content, sourceLines = false }) {
  const blocks = parseMarkdown(content)
  return (
    <div className={styles.prose}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} dataLine={sourceLines ? block.line : undefined} />
      ))}
    </div>
  )
}

function Block({ block, dataLine }) {
  if (block.type === "heading") {
    const Heading = block.level === 3 ? "h3" : "h2"
    return (
      <Heading id={block.id} data-line={dataLine}>
        <Inline nodes={block.children} />
      </Heading>
    )
  }

  if (block.type === "list") {
    const List = block.ordered ? "ol" : "ul"
    return (
      <List
        start={block.ordered && block.start !== 1 ? block.start : undefined}
        data-line={dataLine}
      >
        {block.items.map((lines, index) => (
          <li key={index}>
            <Lines lines={lines} />
          </li>
        ))}
      </List>
    )
  }

  if (block.type === "table") {
    return <Table block={block} dataLine={dataLine} />
  }

  return (
    <p data-line={dataLine}>
      <Lines lines={block.lines} />
    </p>
  )
}

/** Wide tables scroll sideways on small screens instead of squashing the text. */
function Table({ block, dataLine }) {
  const alignOf = (index) => (block.align[index] ? { textAlign: block.align[index] } : undefined)
  // A header row left completely empty is left out.
  const hasHeader = block.header.some((cell) => cell.length > 0)
  return (
    <div className={styles.tableScroll} data-line={dataLine}>
      <table>
        {hasHeader && (
          <thead>
            <tr>
              {block.header.map((cell, index) => (
                <th key={index} scope="col" style={alignOf(index)}>
                  <Inline nodes={cell} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) => (
                <td key={index} style={alignOf(index)}>
                  <Inline nodes={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Lines of one paragraph or list item, with line breaks between them. */
function Lines({ lines }) {
  return lines.map((nodes, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      <Inline nodes={nodes} />
    </Fragment>
  ))
}

function Inline({ nodes }) {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "strong":
        return (
          <strong key={index}>
            <Inline nodes={node.children} />
          </strong>
        )
      case "em":
        return (
          <em key={index}>
            <Inline nodes={node.children} />
          </em>
        )
      case "link":
        return (
          <TextLink key={index} href={node.href}>
            <Inline nodes={node.children} />
          </TextLink>
        )
      default:
        return <Fragment key={index}>{node.text}</Fragment>
    }
  })
}

/** Site pages use client-side navigation; other websites open in a new tab. */
function TextLink({ href, children }) {
  if (href.startsWith("/") || href.startsWith("#")) {
    return <Link href={href}>{children}</Link>
  }
  if (/^https?:/i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  }
  return <a href={href}>{children}</a>
}
