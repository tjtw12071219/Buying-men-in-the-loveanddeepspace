// --- 設定區 (請務必替換成你的 Supabase 資料) ---
const SUPABASE_URL = 'https://vfrbwfhhxcxmglqlhdut.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_0HAfXKHDljbbCCCr2XWyJQ_zlJDVIvo'; 

// 初始化 Supabase
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM 元素
const postsContainer = document.getElementById('postsContainer');
const searchInput = document.getElementById('searchInput');
const filterTagsDiv = document.getElementById('filterTags');
const modal = document.getElementById('postModal');
const openModalBtn = document.getElementById('openPostModalBtn');
const closeModalBtn = document.querySelector('.close-btn');
const postForm = document.getElementById('postForm');
const submitBtn = document.getElementById('submitBtn');

// --- 1. 讀取貼文 ---
async function fetchPosts() {
    postsContainer.innerHTML = '<div class="loading">載入中...</div>';
    
    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        postsContainer.innerHTML = '載入失敗，請稍後再試。';
        console.error(error);
        return;
    }
    renderPosts(data);
}

// --- 2. 渲染貼文 (含消毒與單圖顯示) ---
function renderPosts(posts) {
    postsContainer.innerHTML = '';
    
    const searchText = searchInput.value.toLowerCase();
    const checkedFilters = Array.from(filterTagsDiv.querySelectorAll('input:checked')).map(cb => cb.value);

    const filteredPosts = posts.filter(post => {
        // 搜尋篩選
        const matchesText = post.big_title.toLowerCase().includes(searchText) || 
                            post.small_title.toLowerCase().includes(searchText);
        
        // 標籤篩選
        let matchesTag = true;
        if (checkedFilters.length > 0) {
            matchesTag = post.tags.some(tag => checkedFilters.includes(tag));
        }

        return matchesText && matchesTag;
    });

    if (filteredPosts.length === 0) {
        postsContainer.innerHTML = '沒有符合條件的商品。';
        return;
    }

    filteredPosts.forEach(post => {
        // 使用 DOMPurify 進行消毒
        const safeBigTitle = DOMPurify.sanitize(post.big_title);
        const safeSmallTitle = DOMPurify.sanitize(post.small_title);
        const safePrice = DOMPurify.sanitize(post.price);
        const safeLink = DOMPurify.sanitize(post.fb_link);
        const safeImgUrl = DOMPurify.sanitize(post.image_url);

        let tagsHtml = post.tags.map(t => `<span>${DOMPurify.sanitize(t)}</span>`).join('');

        const card = document.createElement('div');
        card.className = 'card';
        // 安全連結 Noopener
        card.innerHTML = `
            <div class="card-big-title">${safeBigTitle}</div>
            <div class="card-small-title">${safeSmallTitle}</div>
            <div class="card-images">
                <img src="${safeImgUrl}" loading="lazy" alt="商品圖">
            </div>
            <div class="card-info">
                <div class="card-tags">${tagsHtml}</div>
                <span class="card-price">NT$ ${safePrice}</span>
                <a href="${safeLink}" target="_blank" rel="noopener noreferrer" class="card-link">前往 FB 聯絡賣家</a>
            </div>
        `;
        postsContainer.appendChild(card);
    });
}

// --- 3. 發文邏輯 (單圖限制版) ---
postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerText = '處理中...';

    // 取得欄位值
    const bigTitle = document.getElementById('bigTitle').value.trim();
    const smallTitle = document.getElementById('smallTitle').value.trim();
    const fbLink = document.getElementById('fbLink').value.trim();
    const price = document.getElementById('price').value.trim();
    const imageInput = document.getElementById('imageInput');
    const selectedTags = Array.from(document.querySelectorAll('input[name="postTag"]:checked')).map(cb => cb.value);

    // --- 前端驗證 ---
    if (!fbLink.includes('facebook.com')) {
        alert('連結無效：必須是 Facebook 連結');
        resetBtn(); return;
    }
    if (imageInput.files.length === 0) {
        alert('請上傳一張圖片');
        resetBtn(); return;
    }
    if (selectedTags.length === 0) {
        alert('請至少選擇一個標籤');
        resetBtn(); return;
    }

    // 檢查圖片大小 (1MB)
    const file = imageInput.files[0];
    const maxSize = 1 * 1024 * 1024; // 1MB
    if (file.size > maxSize) {
        alert(`檔案太大 (${(file.size/1024/1024).toFixed(2)}MB)，請小於 1MB`);
        resetBtn(); return;
    }

    try {
        // 1. 上傳圖片
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const { data, error: uploadError } = await supabase.storage
            .from('post-images')
            .upload(fileName, file);
        
        if (uploadError) throw uploadError;
        
        // 取得公開連結
        const { data: { publicUrl } } = supabase.storage
            .from('post-images')
            .getPublicUrl(fileName);

        // 2. 寫入資料庫
        const { error: insertError } = await supabase
            .from('posts')
            .insert([{
                big_title: bigTitle,
                small_title: smallTitle,
                fb_link: fbLink,
                price: price,
                tags: selectedTags,
                image_url: publicUrl, // 存網址
                image_path: fileName  // 存路徑 (供後端刪除用)
            }]);

        if (insertError) {
            if (insertError.message.includes('Limit 2 posts')) {
                alert('發文失敗：您今天已經發佈兩篇貼文了。');
            } else {
                alert('發文失敗：' + insertError.message);
            }
            throw insertError;
        }

        alert('發佈成功！');
        postForm.reset();
        modal.style.display = 'none';
        fetchPosts(); // 重新整理列表

    } catch (err) {
        console.error(err);
        alert('發生錯誤，請稍後再試。');
    } finally {
        resetBtn();
    }
});

function resetBtn() {
    submitBtn.disabled = false;
    submitBtn.innerText = '送出發文 (無法修改/刪除)';
}

// --- 事件監聽 ---
openModalBtn.onclick = () => modal.style.display = "block";
closeModalBtn.onclick = () => modal.style.display = "none";
window.onclick = (event) => {
    if (event.target == modal) modal.style.display = "none";
}
searchInput.addEventListener('input', () => fetchPosts());
filterTagsDiv.addEventListener('change', () => fetchPosts());

// 初始載入
fetchPosts();