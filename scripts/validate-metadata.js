#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// 前置元数据规范定义
const METADATA_SCHEMAS = {
  'computer-science': {
    required: ['title', 'description', 'tags', 'sidebar_position'],
    optional: ['difficulty', 'prerequisites', 'estimated_time', 'related_topics'],
    tags: ['算法', '数据结构', '操作系统', '计算机网络', '数据库', '系统编程']
  },
  'frontend': {
    required: ['title', 'description', 'tags', 'sidebar_position'],
    optional: ['framework_version', 'browser_support', 'demo_link', 'source_code'],
    tags: ['Vue', 'React', 'TypeScript', 'CSS', 'JavaScript', '前端工程化']
  },
  'backend': {
    required: ['title', 'description', 'tags', 'sidebar_position'],
    optional: ['tech_stack', 'performance', 'security_level', 'scalability'],
    tags: ['Node.js', 'Express', '数据库', 'API', '微服务', '部署']
  },
  'ai': {
    required: ['title', 'description', 'tags', 'sidebar_position'],
    optional: ['model_type', 'dataset', 'accuracy', 'use_cases'],
    tags: ['LangChain', 'RAG', '提示工程', '机器学习', 'AI应用']
  },
  'projects': {
    required: ['title', 'description', 'tags', 'project_type', 'tech_stack', 'status'],
    optional: ['duration', 'team_size', 'demo_link', 'github_link'],
    tags: ['Web应用', '移动应用', '工具库', '开源项目'],
    project_types: ['web_application', 'mobile_app', 'library', 'tool', 'plugin'],
    statuses: ['completed', 'in-progress', 'planned', 'archived']
  },
  'interview': {
    required: ['title', 'description', 'tags', 'difficulty', 'category'],
    optional: ['company', 'frequency', 'follow_up', 'related_questions'],
    difficulties: ['easy', 'medium', 'hard'],
    categories: ['技术基础', '算法题', '系统设计', '项目经验', '行为面试']
  }
};

// 验证单个文件的元数据
function validateFileMetadata(filePath, content) {
  const errors = [];
  const warnings = [];
  
  try {
    const { data: frontMatter } = matter(content);
    const category = getCategoryFromPath(filePath);
    const schema = METADATA_SCHEMAS[category];
    
    if (!schema) {
      warnings.push(`未找到分类 "${category}" 的元数据规范`);
      return { errors, warnings };
    }
    
    // 检查必需字段
    schema.required.forEach(field => {
      if (!frontMatter[field]) {
        errors.push(`缺少必需字段: ${field}`);
      }
    });
    
    // 验证特定字段的值
    if (schema.difficulties && frontMatter.difficulty) {
      if (!schema.difficulties.includes(frontMatter.difficulty)) {
        errors.push(`无效的难度等级: ${frontMatter.difficulty}`);
      }
    }
    
    if (schema.project_types && frontMatter.project_type) {
      if (!schema.project_types.includes(frontMatter.project_type)) {
        errors.push(`无效的项目类型: ${frontMatter.project_type}`);
      }
    }
    
    if (schema.statuses && frontMatter.status) {
      if (!schema.statuses.includes(frontMatter.status)) {
        errors.push(`无效的状态: ${frontMatter.status}`);
      }
    }
    
    // 检查标签
    if (frontMatter.tags && Array.isArray(frontMatter.tags)) {
      const invalidTags = frontMatter.tags.filter(tag => 
        schema.tags && !schema.tags.some(validTag => 
          tag.includes(validTag) || validTag.includes(tag)
        )
      );
      if (invalidTags.length > 0) {
        warnings.push(`建议的标签不在推荐列表中: ${invalidTags.join(', ')}`);
      }
    }
    
    // 检查标题格式
    if (frontMatter.title) {
      if (frontMatter.title.length > 60) {
        warnings.push(`标题过长 (${frontMatter.title.length} > 60字符)`);
      }
    }
    
    // 检查描述格式
    if (frontMatter.description) {
      if (frontMatter.description.length > 160) {
        warnings.push(`描述过长 (${frontMatter.description.length} > 160字符)`);
      }
    }
    
  } catch (error) {
    errors.push(`解析Front Matter失败: ${error.message}`);
  }
  
  return { errors, warnings };
}

// 从文件路径获取分类
function getCategoryFromPath(filePath) {
  const pathParts = filePath.split(path.sep);
  const docsIndex = pathParts.findIndex(part => part === 'docs');
  if (docsIndex !== -1 && docsIndex < pathParts.length - 1) {
    return pathParts[docsIndex + 1];
  }
  return 'unknown';
}

// 递归扫描目录
function scanDirectory(dirPath, results = []) {
  const items = fs.readdirSync(dirPath);
  
  items.forEach(item => {
    const itemPath = path.join(dirPath, item);
    const stats = fs.statSync(itemPath);
    
    if (stats.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      scanDirectory(itemPath, results);
    } else if (stats.isFile() && item.endsWith('.md')) {
      results.push(itemPath);
    }
  });
  
  return results;
}

// 生成元数据模板
function generateMetadataTemplate(category, filePath) {
  const schema = METADATA_SCHEMAS[category];
  if (!schema) return '';
  
  const template = ['---'];
  
  schema.required.forEach(field => {
    switch (field) {
      case 'title':
        template.push(`${field}: ""`);
        break;
      case 'description':
        template.push(`${field}: ""`);
        break;
      case 'tags':
        const sampleTags = schema.tags ? schema.tags.slice(0, 3) : ['tag1', 'tag2'];
        template.push(`${field}: [${sampleTags.map(t => `"${t}"`).join(', ')}]`);
        break;
      case 'sidebar_position':
        template.push(`${field}: 1`);
        break;
      case 'difficulty':
        const defaultDifficulty = schema.difficulties ? schema.difficulties[0] : 'easy';
        template.push(`${field}: "${defaultDifficulty}"`);
        break;
      case 'category':
        const defaultCategory = schema.categories ? schema.categories[0] : 'general';
        template.push(`${field}: "${defaultCategory}"`);
        break;
      case 'project_type':
        const defaultType = schema.project_types ? schema.project_types[0] : 'web_application';
        template.push(`${field}: "${defaultType}"`);
        break;
      case 'status':
        const defaultStatus = schema.statuses ? schema.statuses[0] : 'planned';
        template.push(`${field}: "${defaultStatus}"`);
        break;
      case 'tech_stack':
        template.push(`${field}:`);
        template.push(`  frontend: ["React", "TypeScript"]`);
        template.push(`  backend: ["Node.js", "Express"]`);
        template.push(`  tools: ["Git", "VS Code"]`);
        break;
      default:
        template.push(`${field}: ""`);
    }
  });
  
  template.push('---');
  template.push('');
  
  return template.join('\n');
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'validate') {
    const docsPath = path.join(process.cwd(), 'docs');
    if (!fs.existsSync(docsPath)) {
      console.error('docs目录不存在');
      process.exit(1);
    }
    
    const markdownFiles = scanDirectory(docsPath);
    let totalErrors = 0;
    let totalWarnings = 0;
    
    console.log(`\n📋 验证 ${markdownFiles.length} 个Markdown文件的元数据...\n`);
    
    markdownFiles.forEach(filePath => {
      const content = fs.readFileSync(filePath, 'utf8');
      const { errors, warnings } = validateFileMetadata(filePath, content);
      const relativePath = path.relative(process.cwd(), filePath);
      
      if (errors.length > 0 || warnings.length > 0) {
        console.log(`📄 ${relativePath}`);
        
        if (errors.length > 0) {
          console.log('  ❌ 错误:');
          errors.forEach(error => console.log(`    • ${error}`));
          totalErrors += errors.length;
        }
        
        if (warnings.length > 0) {
          console.log('  ⚠️  警告:');
          warnings.forEach(warning => console.log(`    • ${warning}`));
          totalWarnings += warnings.length;
        }
        
        console.log('');
      }
    });
    
    console.log(`\n📊 验证完成:`);
    console.log(`  • 总文件数: ${markdownFiles.length}`);
    console.log(`  • 错误: ${totalErrors}`);
    console.log(`  • 警告: ${totalWarnings}`);
    
    if (totalErrors > 0) {
      console.log('\n❌ 存在元数据错误，请修复后重试');
      process.exit(1);
    } else {
      console.log('\n✅ 所有文件元数据验证通过');
    }
    
  } else if (command === 'template') {
    const category = args[1];
    const filePath = args[2] || 'example.md';
    
    if (!category || !METADATA_SCHEMAS[category]) {
      console.log('用法: npm run metadata template <category> [filepath]');
      console.log('可用分类:', Object.keys(METADATA_SCHEMAS).join(', '));
      process.exit(1);
    }
    
    const template = generateMetadataTemplate(category, filePath);
    console.log('生成的元数据模板:');
    console.log('');
    console.log(template);
    
  } else {
    console.log('元数据管理工具');
    console.log('');
    console.log('用法:');
    console.log('  npm run metadata validate    - 验证所有Markdown文件的元数据');
    console.log('  npm run metadata template <category> - 生成元数据模板');
    console.log('');
    console.log('可用分类:', Object.keys(METADATA_SCHEMAS).join(', '));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  validateFileMetadata,
  METADATA_SCHEMAS,
  generateMetadataTemplate
};