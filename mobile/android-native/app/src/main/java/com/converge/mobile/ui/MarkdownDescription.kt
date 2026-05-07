package com.converge.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.network.NetworkHeaders
import coil3.network.httpHeaders
import coil3.request.ImageRequest
import coil3.request.crossfade
import org.commonmark.Extension
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.ext.gfm.tables.TableBody
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.ext.gfm.tables.TableHead
import org.commonmark.ext.gfm.tables.TableRow
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.BulletList
import org.commonmark.node.Code
import org.commonmark.node.Document
import org.commonmark.node.Emphasis
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.HardLineBreak
import org.commonmark.node.Heading
import org.commonmark.node.Image
import org.commonmark.node.IndentedCodeBlock
import org.commonmark.node.Link
import org.commonmark.node.ListItem
import org.commonmark.node.Node
import org.commonmark.node.OrderedList
import org.commonmark.node.Paragraph
import org.commonmark.node.SoftLineBreak
import org.commonmark.node.StrongEmphasis
import org.commonmark.node.Text as MarkdownTextNode
import org.commonmark.node.ThematicBreak
import org.commonmark.parser.Parser

data class MarkdownImageSource(
    val url: String,
    val bearerToken: String? = null,
    val description: String? = null,
)

private val markdownExtensions = listOf<Extension>(TablesExtension.create())
private val markdownParser = Parser.builder().extensions(markdownExtensions).build()

private fun collapseToBlockquote(title: String, content: String): String {
    val t = title.trim().let { if (it.isEmpty() || it.matches(Regex("(?i)show\\s*,\\s*hide|hide\\s*,\\s*show"))) "Details" else it }
    val body = content.trim()
    if (body.isEmpty()) return "> **$t**"
    val quoted = body.lines().joinToString("\n") { if (it.trim().isEmpty()) ">" else "> $it" }
    return "> **$t**\n>\n$quoted"
}

private fun sanitizeTextile(raw: String): String {
    // Decode escaped whitespace sequences
    var out = raw.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\r", "\n")

    // Strip TOC macros
    out = out.replace(Regex("(?im)^\\s*\\{\\{>?toc(?:\\((?:[^()]|\\([^)]*\\))*\\))?\\}\\}\\s*$"), "")

    // Strip <notextile> tags
    out = out.replace(Regex("(?i)</?notextile>"), "")

    // {{collapse(Title)\ncontent\n}} → blockquote
    out = out.replace(Regex("(?s)\\{\\{collapse(?:\\(([^)]*)\\))?\\s*\\n([\\s\\S]*?)\\n\\}\\}", RegexOption.IGNORE_CASE)) { m ->
        collapseToBlockquote(m.groupValues[1], m.groupValues[2])
    }

    // {{collapse(Title)|content}} → blockquote
    out = out.replace(Regex("(?s)\\{\\{collapse(?:\\(([^)]*)\\))?\\s*\\|([\\s\\S]*?)\\}\\}", RegexOption.IGNORE_CASE)) { m ->
        collapseToBlockquote(m.groupValues[1], m.groupValues[2])
    }

    // Strip remaining {{macro}} blocks
    out = out.replace(Regex("\\{\\{[^}]*\\}\\}"), "")

    // h1.–h6. → markdown headings
    out = out.replace(Regex("(?m)^h([1-6])\\.\\s+(.+)$")) { m ->
        "#".repeat(m.groupValues[1].toInt()) + " " + m.groupValues[2].trim()
    }

    // "link text":url → [link text](url)
    out = out.replace(Regex("\"([^\"\\n]+)\":(https?://[^\\s<>\"')\\]]+)"), "[$1]($2)")

    // Redmine Textile image syntax → markdown image. Attachment resolution happens during rendering.
    out = out.replace(Regex("!(?:\\{[^}]*\\})?((?:https?://[^\\s!]+|[^!\\n]+?\\.(?:png|jpe?g|gif|webp|bmp|svg)))(?:\\([^)]*\\))?!", RegexOption.IGNORE_CASE)) { m ->
        val destination = m.groupValues[1].trim()
        val label = destination.substringBefore('?').substringAfterLast('/').ifBlank { "image" }
        "![$label]($destination)"
    }

    // %{css}text% → text  (styled span — single line only)
    out = out.replace(Regex("%\\{[^}\\n]*\\}([^%\\n]+)%"), "$1")

    // @code@ → `code`
    out = out.replace(Regex("(?<![\\w`])@([^\\n@]+?)@(?=[^\\w`]|\$)"), "`$1`")

    // [[WikiPage|Label]] → Label
    out = out.replace(Regex("\\[\\[([^|\\]]+)\\|([^\\]]+)\\]\\]"), "$2")
    // [[WikiPage]] → WikiPage
    out = out.replace(Regex("\\[\\[([^\\]]+)\\]\\]"), "$1")

    // Bullet characters → markdown list
    out = out.replace(Regex("(?m)^(\\s*)[•·]\\s*"), "$1- ")

    return out
}

@Composable
fun MarkdownDescription(
    markdown: String,
    modifier: Modifier = Modifier,
    imageResolver: ((String) -> MarkdownImageSource?)? = null,
) {
    val document = remember(markdown) { markdownParser.parse(sanitizeTextile(markdown)) as Document }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        var node = document.firstChild
        while (node != null) {
            MarkdownBlock(node, imageResolver)
            node = node.next
        }
    }
}

@Composable
private fun MarkdownBlock(node: Node, imageResolver: ((String) -> MarkdownImageSource?)?) {
    when (node) {
        is Heading -> Text(
            text = inlineText(node),
            style = when (node.level) {
                1 -> MaterialTheme.typography.titleLarge
                2 -> MaterialTheme.typography.titleMedium
                else -> MaterialTheme.typography.titleSmall
            },
            fontWeight = FontWeight.SemiBold,
        )

        is Paragraph -> {
            val image = singleImage(node)
            if (image == null) {
                Text(
                    text = inlineText(node),
                    style = MaterialTheme.typography.bodyMedium,
                )
            } else {
                MarkdownImage(image, imageResolver)
            }
        }

        is BulletList -> MarkdownList(node, ordered = false)
        is OrderedList -> MarkdownList(node, ordered = true)
        is TableBlock -> MarkdownTable(node)

        is FencedCodeBlock -> CodeBlock(node.literal.trimEnd(), node.info)
        is IndentedCodeBlock -> CodeBlock(node.literal.trimEnd(), null)

        is ThematicBreak -> Text("------", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
        else -> Text(text = inlineText(node), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun CodeBlock(code: String, info: String?) {
    val language = remember(info) { info?.trim()?.substringBefore(' ')?.lowercase().orEmpty() }
    Text(
        text = remember(code, language) { highlightedCode(code, language) },
        style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFFF1F5F9), RoundedCornerShape(8.dp))
            .padding(12.dp),
    )
}

@Composable
private fun MarkdownTable(table: TableBlock) {
    Column(modifier = Modifier.horizontalScroll(rememberScrollState())) {
        var child = table.firstChild
        while (child != null) {
            when (child) {
                is TableHead -> MarkdownTableSection(child, header = true)
                is TableBody -> MarkdownTableSection(child, header = false)
            }
            child = child.next
        }
    }
}

@Composable
private fun MarkdownTableSection(section: Node, header: Boolean) {
    var row = section.firstChild
    while (row != null) {
        if (row is TableRow) {
            Row {
                var cell = row.firstChild
                while (cell != null) {
                    if (cell is TableCell) {
                        MarkdownTableCell(cell, header)
                    }
                    cell = cell.next
                }
            }
        }
        row = row.next
    }
}

@Composable
private fun MarkdownTableCell(cell: TableCell, header: Boolean) {
    Box(
        modifier = Modifier
            .widthIn(min = 118.dp, max = 220.dp)
            .border(0.5.dp, MaterialTheme.colorScheme.outlineVariant)
            .background(if (header) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surface)
            .padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        Text(
            text = inlineText(cell),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = if (header) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

@Composable
private fun MarkdownImage(image: Image, imageResolver: ((String) -> MarkdownImageSource?)?) {
    val destination = image.destination.orEmpty().trim()
    val altText = plainText(image)
    val source = imageResolver?.invoke(destination)
        ?: destination.takeIf { it.startsWith("http://") || it.startsWith("https://") }?.let {
            MarkdownImageSource(url = it, description = altText.takeIf(String::isNotBlank))
        }
    if (source == null) {
        Text(
            text = altText.ifBlank { destination },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    val context = LocalContext.current
    val request = remember(source.url, source.bearerToken) {
        ImageRequest.Builder(context)
            .data(source.url)
            .crossfade(true)
            .apply {
                source.bearerToken?.takeIf { it.isNotBlank() }?.let { token ->
                    httpHeaders(NetworkHeaders.Builder().set("Authorization", "Bearer $token").build())
                }
            }
            .build()
    }
    AsyncImage(
        model = request,
        contentDescription = source.description ?: altText.ifBlank { "Attachment image" },
        contentScale = ContentScale.Fit,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 120.dp, max = 420.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    )
}

private fun singleImage(paragraph: Paragraph): Image? {
    val first = paragraph.firstChild
    return if (first is Image && first.next == null) first else null
}

@Composable
private fun MarkdownList(node: Node, ordered: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        var index = 1
        var child = node.firstChild
        while (child != null) {
            if (child is ListItem) {
                val prefix = if (ordered) "${index}." else "-"
                val content = inlineText(child)
                val taskPrefix = content.text.take(4).lowercase()
                val taskMarker = when (taskPrefix) {
                    "[x] " -> "☑"
                    "[ ] " -> "☐"
                    else -> null
                }
                Text(
                    text = buildAnnotatedString {
                        append(taskMarker ?: prefix)
                        append(" ")
                        append(if (taskMarker == null) content else AnnotatedString(content.text.drop(4)))
                    },
                    style = MaterialTheme.typography.bodyMedium,
                )
                index += 1
            }
            child = child.next
        }
    }
}

private fun inlineText(node: Node): AnnotatedString = buildAnnotatedString {
    appendNode(node)
}

private fun AnnotatedString.Builder.appendChildren(node: Node) {
    var child = node.firstChild
    while (child != null) {
        appendNode(child)
        child = child.next
    }
}

private fun AnnotatedString.Builder.appendNode(node: Node) {
    when (node) {
        is MarkdownTextNode -> append(node.literal)
        is Code -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = Color(0xFFE2E8F0))) {
            append(node.literal)
        }

        is SoftLineBreak -> append(" ")
        is HardLineBreak -> append("\n")
        is Emphasis -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
            appendChildren(node)
        }

        is StrongEmphasis -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
            appendChildren(node)
        }

        is Link -> withStyle(SpanStyle(color = Color(0xFF0F766E), textDecoration = TextDecoration.Underline)) {
            appendChildren(node)
        }
        is Image -> withStyle(SpanStyle(color = Color(0xFF0F766E), textDecoration = TextDecoration.Underline)) {
            append(plainText(node).ifBlank { node.destination.orEmpty() })
        }
        else -> appendChildren(node)
    }
}

private fun plainText(node: Node): String = buildString { appendPlainText(node) }

private fun StringBuilder.appendPlainText(node: Node) {
    when (node) {
        is MarkdownTextNode -> append(node.literal)
        is Code -> append(node.literal)
        is SoftLineBreak -> append(" ")
        is HardLineBreak -> append("\n")
        else -> {
            var child = node.firstChild
            while (child != null) {
                appendPlainText(child)
                child = child.next
            }
        }
    }
}

private fun highlightedCode(code: String, language: String): AnnotatedString = buildAnnotatedString {
    val keywords = when (language) {
        "kt", "kotlin" -> setOf("class", "data", "fun", "val", "var", "if", "else", "when", "return", "suspend", "private", "public", "import", "package", "object", "interface", "null", "true", "false")
        "ts", "tsx", "js", "jsx", "javascript", "typescript" -> setOf("const", "let", "var", "function", "return", "if", "else", "await", "async", "import", "export", "from", "type", "interface", "class", "new", "null", "true", "false")
        "java" -> setOf("class", "public", "private", "protected", "static", "final", "void", "return", "if", "else", "new", "null", "true", "false", "import", "package")
        "py", "python" -> setOf("def", "class", "return", "if", "elif", "else", "import", "from", "as", "None", "True", "False", "async", "await", "with", "lambda")
        "sh", "bash", "zsh", "shell" -> setOf("if", "then", "else", "fi", "for", "do", "done", "case", "esac", "export", "local", "function")
        else -> emptySet()
    }
    val keywordRegex = if (keywords.isEmpty()) null else Regex("\\b(${keywords.joinToString("|") { Regex.escape(it) }})\\b")
    code.lines().forEachIndexed { lineIndex, line ->
        if (lineIndex > 0) append("\n")
        appendHighlightedLine(line, language, keywordRegex)
    }
}

private fun AnnotatedString.Builder.appendHighlightedLine(line: String, language: String, keywordRegex: Regex?) {
    val trimmed = line.trimStart()
    val commentPrefix = when {
        language in setOf("py", "python", "sh", "bash", "zsh", "shell") -> "#"
        else -> "//"
    }
    if (trimmed.startsWith(commentPrefix)) {
        withStyle(SpanStyle(color = Color(0xFF64748B), fontStyle = FontStyle.Italic)) { append(line) }
        return
    }

    val tokenRegex = Regex("\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|\\b\\d+(?:\\.\\d+)?\\b")
    var index = 0
    tokenRegex.findAll(line).forEach { match ->
        appendPlainCode(line.substring(index, match.range.first), keywordRegex)
        val token = match.value
        val color = if (token.firstOrNull()?.isDigit() == true) Color(0xFF9333EA) else Color(0xFFB45309)
        withStyle(SpanStyle(color = color)) { append(token) }
        index = match.range.last + 1
    }
    appendPlainCode(line.substring(index), keywordRegex)
}

private fun AnnotatedString.Builder.appendPlainCode(text: String, keywordRegex: Regex?) {
    if (keywordRegex == null) {
        append(text)
        return
    }
    var index = 0
    keywordRegex.findAll(text).forEach { match ->
        append(text.substring(index, match.range.first))
        withStyle(SpanStyle(color = Color(0xFF2563EB), fontWeight = FontWeight.SemiBold)) {
            append(match.value)
        }
        index = match.range.last + 1
    }
    append(text.substring(index))
}
